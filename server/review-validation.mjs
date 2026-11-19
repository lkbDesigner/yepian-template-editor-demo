import {readFileSync} from 'node:fs';
import validator from '../portfolio-test/shared/review-validation.js';
export const portfolioSchema=JSON.parse(readFileSync(new URL('./portfolio-schema.json',import.meta.url),'utf8'));
export function validateReviewDraft(state){return validator.validate(state,portfolioSchema);}
