import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('models_list.json', 'utf16le').replace(/^\uFEFF/, ''));
const model = data.models.find((m: any) => m.supportedGenerationMethods.includes('generateContent'));
console.log("Recommended Model:", model ? model.name : "None");
