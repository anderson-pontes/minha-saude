const forms=new Set<string>()
export function setFormUnsaved(id:string,dirty:boolean){if(dirty)forms.add(id);else forms.delete(id)}
export function hasUnsavedForms(){return forms.size>0}
