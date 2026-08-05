// Backwards-compatible browser facade. Gemini credentials and SDK usage live only
// behind /api/ai; new code may import the same exports from ./aiClient directly.
export * from './aiClient';
