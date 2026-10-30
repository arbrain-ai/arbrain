// Authentication is outside this browser contract. The real web routes have
// separate authorization tests; no credentials or actual profile are used here.
export function useAuth() { return { profile: { id: 'fixture-owner' }, loading: false } }
