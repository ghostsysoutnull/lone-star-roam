// Runner self-test fixture — throws at module-evaluation time, before
// default() ever exists. The dynamic import() itself rejects, so this
// exercises the "suite import error / node-side throw outside checks,
// browser alive" row of the failure matrix: classified as a 'runner'-type
// suite failure (checked: null), never a rejected worker that kills the pool
// (the bug this wave closes).
throw new Error('selftest-importfail');
