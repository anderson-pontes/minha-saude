"""Extract PDFs and emit auditable JSON/CSV; Node CLI handles the existing Supabase SDK."""
import argparse
import csv
import json
from pathlib import Path
from imports.unicasf import extract_pdf, parse_document, build_bundle


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', action='append', required=True)
    parser.add_argument('--report', default='data/unicasf-review/import')
    args = parser.parse_args()
    bundle = build_bundle([parse_document(extract_pdf(file)) for file in args.file])
    output = Path(args.report)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.with_suffix('.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding='utf8')
    with output.with_suffix('.csv').open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=['record_id', 'file', 'page_start', 'page_end', 'warning'])
        writer.writeheader()
        writer.writerows(bundle['issues'])
    with output.with_suffix('.entities.csv').open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=['category', 'key', 'name', 'status', 'warnings', 'sources'])
        writer.writeheader()
        for entity in bundle['entities']:
            writer.writerow({'category': entity['category'], 'key': entity['key'], 'name': entity['data']['name'],
                             'status': entity['status'], 'warnings': ';'.join(entity['warnings']),
                             'sources': ';'.join(f'{s["file"]}:{s["page_start"]}-{s["page_end"]}' for s in entity['sources'])})
    print(json.dumps(bundle['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
