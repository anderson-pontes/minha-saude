"""Deterministic UNICASF extraction. No database access or generated completions."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from pathlib import Path

VERSION = "1.0.0"
CNPJ = re.compile(r"\(\s*CNPJ:\s*([\d./-]+)\s*\)\s*-\s*(.*)")
COUNCIL = re.compile(r"\((CRM|CRP|CRN|CREFITO|CREFONO|CRO|COREN)-\s*([A-Z]{2})?\s*([\d.]+)?\s*\)")
LOCATION = re.compile(r"^(.*?)\s*-\s*([^-]+?)\s*-\s*([A-Z]{2})\s*-\s*CEP:\s*([\d-]*)$")
PHONE = re.compile(r"\((\d{2})\)\s*(\d{4,5})\s*-?\s*(\d{4})")
# Procedures/services stay out of the specialties catalogue. The original label is retained.
SERVICES = {"ULTRA SONOGRAFIA", "TOMOGRAFIA COMPUTADORIZADA", "RESSONANCIA MAGNETICA",
            "RPG", "QUIMIOTERAPIA DO CANCER", "NUTRICAO ENTERAL E PARENTERAL"}


def normalize(value):
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", "".join(
        c for c in unicodedata.normalize("NFD", value.upper()) if not unicodedata.combining(c)))).strip()


def digits(value):
    return re.sub(r"\D", "", value or "")


def valid_cnpj(value):
    value = digits(value)
    if len(value) != 14 or len(set(value)) == 1:
        return False
    for size in (12, 13):
        weights = ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if size == 12 else
                   [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
        remainder = sum(int(n) * w for n, w in zip(value[:size], weights)) % 11
        if int(value[size]) != (0 if remainder < 2 else 11 - remainder):
            return False
    return True


def professional(text):
    match = COUNCIL.search(text)
    if not match:
        return None
    prefix = text[:match.start()].strip().removeprefix("- ").strip()
    name = prefix.split("(", 1)[0].strip()
    notes = (prefix[len(name):] + " " + text[match.end():]).strip(" -")
    if notes in {"Médico", "Psicólogo", "Nutricionista", "Fisioterapeuta", "Fonoaudiólogo"}:
        notes = ""
    council, state, number = match.groups()
    number = digits(number)
    key = f"{council}:{state}:{number}" if state and number else None
    return {"key": key, "name": name, "professional_council": council,
            "registration_state": state, "registration_number": number or None,
            "attendance_notes": notes, "raw": text,
            "professional_type": {"CRM": "Médico", "CRP": "Psicólogo", "CRN": "Nutricionista",
                                  "CREFITO": "Fisioterapia/Terapia ocupacional", "CREFONO": "Fonoaudiólogo"}.get(council, council)}


def extract_pdf(path):
    import pymupdf
    path = Path(path)
    with pymupdf.open(path) as document:
        pages = []
        for i, page in enumerate(document):
            # Individual positioned lines avoid a footer interleaved into the final content row.
            positioned = []
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = "".join(s["text"] for s in line["spans"]).strip()
                    if text:
                        positioned.append({"text": text, "bbox": list(line["bbox"]),
                                           "bold": any(s["flags"] & 16 for s in line["spans"])})
            positioned.sort(key=lambda line: (round(line["bbox"][1], 1), line["bbox"][0]))
            pages.append({"number": i + 1, "text": page.get_text(sort=True), "lines": positioned})
    return {"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "pages": pages}


def parse_document(source):
    records, current, preamble = [], None, []
    for page in source["pages"]:
        for item in page["lines"]:
            line = item["text"].strip()
            if line.startswith("CAIXA DE ASSISTENCIA") or line == "Rede Credenciada" or re.fullmatch(r"Page \d+/\d+", line):
                continue
            company = CNPJ.search(line)
            person = professional(line)
            is_person_header = bool(person and not line.startswith("-") and
                                    re.search(r"\)\s*-\s*(Médico|Psicólogo|Nutricionista|Fisioterapeuta|Fonoaudiólogo)", line, re.I))
            if company or is_person_header:
                current = {"source_file": source["file"], "source_sha256": source["sha256"],
                           "page_start": page["number"], "page_end": page["number"], "lines": [],
                           "category": "establishments" if company else "doctors", "warnings": []}
                records.append(current)
            if current is None:
                preamble.append({"page": page["number"], "text": line})
            else:
                current["page_end"] = page["number"]
                current["lines"].append({**item, "page": page["number"]})
    for index, record in enumerate(records):
        record["record_id"] = f'{source["sha256"][:12]}:{index + 1}'
        parse_record(record)
    totals = {int(m[1]) for p in source["pages"] for line in p["lines"]
              if (m := re.fullmatch(r"Page \d+/(\d+)", line["text"]))}
    document_warnings = [] if not totals or totals == {len(source["pages"])} else ["printed_page_count_mismatch"]
    return {"file": source["file"], "sha256": source["sha256"], "pages_processed": len(source["pages"]),
            "printed_page_totals": sorted(totals), "warnings": document_warnings,
            "preamble": preamble, "records": records, "pages": source["pages"]}


def parse_record(record):
    lines = record["lines"]
    record["raw_text"] = "\n".join(line["text"] for line in lines)
    record.update(specialties=[], services=[], professionals=[], addresses=[], contacts=[], unparsed=[])
    first = lines[0]["text"]
    if record["category"] == "establishments":
        company = CNPJ.search(first)
        record.update(name=first[:company.start()].strip(), cnpj=digits(company[1]), original_kind=company[2])
        kind = normalize(company[2])
        record["kind"] = "hospital" if kind.startswith("HOSP") else "laboratory" if kind.startswith("LABOR") else "clinic" if kind.startswith("CLIN") else "other"
        if not valid_cnpj(record["cnpj"]):
            record["warnings"].append("invalid_cnpj")
        record["trade_name"] = lines[1]["text"] if len(lines) > 1 else ""
        body = lines[2:]
    else:
        record["professional"] = professional(first)
        record["name"] = record["professional"]["name"]
        body = lines[1:]
    current_specialty, contact_section, address_lines = None, False, []
    for item in body:
        line = item["text"]
        location = LOCATION.match(line)
        if location:
            neighborhood, city, state, postal_code = location.groups()
            city = {"BELEM": "Belém", "ANANINDEUA": "Ananindeua"}.get(normalize(city), city.strip())
            raw_street = " ".join(address_lines)
            # Last comma-number is the street number; earlier room/floor fragments remain intact.
            number_match = list(re.finditer(r",\s*(?:N[º°.]*\s*)?(\d[\d.]*|S/N)(?=\s*(?:-|$))", raw_street, re.I))
            street, number, complement = raw_street, "", ""
            if number_match:
                match = number_match[-1]
                street, number = raw_street[:match.start()].strip(" ,"), match[1]
                complement = raw_street[match.end():].strip(" -")
                if ',' in street:
                    street, before_number = street.split(',', 1)
                    complement = ' - '.join(part for part in (before_number.strip(' ,'), complement) if part)
            address = {"street": street, "number": number, "complement": complement,
                       "neighborhood": neighborhood.strip(" -"), "city": city, "state": state,
                       "postal_code": digits(postal_code) or None, "raw": raw_street + "\n" + line}
            record["addresses"].append(address)
            if not street:
                record["warnings"].append("missing_street")
            if len(digits(postal_code)) != 8:
                record["warnings"].append("missing_or_invalid_postal_code")
            address_lines = []
            contact_section = True
        elif line.startswith("Tel:"):
            contact_section = True
            matches = list(PHONE.finditer(line))
            for match in matches:
                record["contacts"].append({"kind": "phone", "value": "".join(match.groups()), "raw": match[0]})
            leftover = PHONE.sub("", line[4:]).strip(" /;")
            if leftover or not matches:
                record["warnings"].append("empty_phone" if not digits(line) else "unparsed_phone")
                record["unparsed"].append(item)
        elif re.match(r"(?:https?://|www\.)", line, re.I):
            record["contacts"].append({"kind": "website", "value": line, "raw": line})
        elif contact_section:
            address_lines.append(line)
        elif line.startswith("-"):
            person = professional(line)
            if person:
                person.update(specialty=current_specialty, page=item["page"])
                record["professionals"].append(person)
                if current_specialty is None:
                    record["warnings"].append("professional_without_specialty")
            else:
                # Unnamed areas of practice are not people and do not change the parent specialty.
                record["services"].append({"name": line.removeprefix("- "), "parent_specialty": current_specialty, "page": item["page"]})
        elif item.get("bold", True) and line == line.upper():
            current_specialty = line
            if normalize(line) in SERVICES:
                record["services"].append({"name": line, "page": item["page"]})
            else:
                record["specialties"].append(line)
        else:
            record["unparsed"].append(item)
            record["warnings"].append("unclassified_line")
    if address_lines:
        record["unparsed"].extend({"text": line} for line in address_lines)
        record["warnings"].append("unparsed_address_or_contact")
    if record["category"] == "doctors":
        if not record["professional"]["key"]:
            record["warnings"].append("incomplete_registration")
    for person in record["professionals"]:
        if not person["key"]:
            record["warnings"].append("incomplete_registration")
    if not record["addresses"]:
        record["warnings"].append("missing_address")
    record["warnings"] = sorted(set(record["warnings"]))
    record["status"] = "review" if record["warnings"] else "validated"


def build_bundle(documents):
    """Resolve only full registrations/CNPJs; weak identities remain separate pending records."""
    entities, links, issues = {}, {}, []

    def add(category, key, data, record):
        key = category + ":" + key
        entity = entities.setdefault(key, {"key": key, "category": category, "data": data,
                                           "sources": [], "warnings": [], "status": "validated"})
        entity["sources"].append({"record_id": record["record_id"], "file": record["source_file"],
                                  "page_start": record["page_start"], "page_end": record["page_end"]})
        for field in ("contacts", "addresses"):
            if field in data:
                entity["data"][field] = list({str(value): value for value in entity["data"].get(field, []) + data[field]}.values())
        return entity

    def link(table, left, right, record, notes=""):
        key = (table, left, right)
        value = links.setdefault(key, {"table": table, "left": left, "right": right, "notes": notes, "sources": []})
        if notes and notes not in value["notes"]:
            value["notes"] += "\n" + notes
        value["sources"].append(record["record_id"])

    plan = {"key": "health_plans:unicasf", "category": "health_plans", "status": "validated", "warnings": [], "sources": [],
            "data": {"name": "UNICASF Saúde", "notes": "Operadora: Caixa de Assistência dos Funcionários do Banco da Amazônia (CASF). Registro apresentado: 47971/018-8. Referência: março/2026."}}
    entities[plan["key"]] = plan
    for document in documents:
        for warning in document.get("warnings", []):
            issues.append({"record_id": "document", "file": document["file"], "page_start": 1,
                           "page_end": document["pages_processed"], "warning": warning})
        for record in document["records"]:
            entity = None
            if record["category"] == "establishments":
                data = {key: record[key] for key in ("name", "kind", "cnpj", "trade_name", "contacts", "addresses")}
                data["notes"] = "Serviços/áreas documentados: " + "; ".join(s["name"] for s in record["services"]) if record["services"] else ""
                entity = add("establishments", record["cnpj"] if valid_cnpj(record["cnpj"]) else record["record_id"], data, record)
                entity["warnings"].extend(w for w in record["warnings"] if w != "incomplete_registration")
                link("establishment_health_plans", entity["key"], plan["key"], record)
            else:
                person = record["professional"]
                data = {**person, "contacts": record["contacts"], "addresses": record["addresses"], "notes": person["attendance_notes"]}
                entity = add("doctors", person["key"] or record["record_id"], data, record)
                entity["warnings"].extend(record["warnings"])
                link("doctor_health_plans", entity["key"], plan["key"], record)
            for label in record["specialties"]:
                specialty = add("specialties", normalize(label), {"name": label.title(), "original_label": label}, record)
                link("establishment_specialties" if record["category"] == "establishments" else "doctor_specialties", entity["key"], specialty["key"], record)
            for person in record["professionals"]:
                doctor = add("doctors", person["key"] or record["record_id"] + ":" + normalize(person["name"]),
                             {**person, "notes": ""}, record)
                if not person["key"]:
                    doctor["warnings"].append("incomplete_registration")
                # Council conflicts and name conflicts are surfaced; never merged by name alone.
                if normalize(doctor["data"]["name"]) != normalize(person["name"]):
                    doctor["warnings"].append("registration_name_conflict")
                label = person["specialty"]
                local_notes = person["attendance_notes"]
                if label and normalize(label) in SERVICES:
                    local_notes = "\n".join(part for part in (local_notes, "Serviço/área no documento: " + label) if part)
                link("doctor_establishments", doctor["key"], entity["key"], record, local_notes)
                link("doctor_establishment_health_plans", doctor["key"], entity["key"], record, local_notes)
                if label and normalize(label) not in SERVICES:
                    specialty = add("specialties", normalize(label), {"name": label.title(), "original_label": label}, record)
                    link("doctor_specialties", doctor["key"], specialty["key"], record)
                    scoped_key = ("doctor_establishment_specialties", doctor["key"], entity["key"], specialty["key"])
                    links.setdefault(scoped_key, {"table": scoped_key[0], "left": doctor["key"], "right": entity["key"],
                                                  "specialty": specialty["key"], "notes": "", "sources": [record["record_id"]]})
            for warning in record["warnings"]:
                issues.append({"record_id": record["record_id"], "file": record["source_file"],
                               "page_start": record["page_start"], "page_end": record["page_end"], "warning": warning})
    critical = {"invalid_cnpj", "incomplete_registration", "registration_name_conflict", "missing_street",
                "professional_without_specialty", "unclassified_line", "unparsed_address_or_contact", "unparsed_phone"}
    for entity in entities.values():
        entity["warnings"] = sorted(set(entity["warnings"]))
        entity["status"] = "review" if critical.intersection(entity["warnings"]) else "validated"
        if "registration_name_conflict" in entity["warnings"]:
            for origin in {s["record_id"]: s for s in entity["sources"]}.values():
                issues.append({"record_id": origin["record_id"], "file": origin["file"], "page_start": origin["page_start"],
                               "page_end": origin["page_end"], "warning": "registration_name_conflict"})
                for document in documents:
                    for record in document["records"]:
                        if record["record_id"] == origin["record_id"]:
                            record["warnings"] = sorted(set(record["warnings"] + ["registration_name_conflict"]))
                            record["status"] = "review"
    # Incomplete registrations with the same name as a complete identity are only suggestions.
    names = {}
    for entity in entities.values():
        if entity["category"] == "doctors":
            names.setdefault(normalize(entity["data"]["name"]), []).append(entity["key"])
    duplicates = [keys for keys in names.values() if len(keys) > 1]
    summary = {"pages_processed": sum(d["pages_processed"] for d in documents),
               "providers": sum(len(d["records"]) for d in documents),
               **{c: sum(e["category"] == c for e in entities.values()) for c in ("establishments", "doctors", "specialties", "health_plans")},
               "planned_links": len(links), "pending_entities": sum(e["status"] == "review" for e in entities.values()),
               "pending_records": sum(r["status"] == "review" for d in documents for r in d["records"]),
               "possible_duplicates": len(duplicates), "warnings": len(issues)}
    summary["identity_conflicts"] = sum("registration_name_conflict" in e["warnings"] for e in entities.values())
    ready_keys = {e["key"] for e in entities.values() if e["status"] == "validated"}
    summary["importable_links"] = sum(l["left"] in ready_keys and l["right"] in ready_keys and
                                      ("specialty" not in l or l["specialty"] in ready_keys) for l in links.values())
    batch_key = hashlib.sha256((VERSION + ":" + ":".join(sorted(d["sha256"] for d in documents))).encode()).hexdigest()
    return {"parser_version": VERSION, "batch_key": batch_key, "documents": documents,
            "entities": list(entities.values()), "links": list(links.values()), "issues": issues,
            "possible_duplicates": duplicates, "summary": summary}
