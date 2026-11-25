require('../lan-trial/run.cjs')().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
