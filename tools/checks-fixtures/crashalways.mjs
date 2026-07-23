// Runner self-test fixture — always closes its own browser mid-body, every
// attempt. Confirms a suite that never survives lands on suite
// status:'infra' and drives the process exit code to 3 (infra-incomplete),
// never a FAIL.
export default async function crashalways(t) {
  await t.page.context().browser().close();
  await t.ev('1'); // always dead — deterministic infra casualty every attempt
}
