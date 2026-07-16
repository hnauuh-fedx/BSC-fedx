declare const __API_BASE_URL__: string | undefined;

export const API_BASE_URL = (typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__ : '/api').replace(/\/$/, '');
