import MCR from "monocart-coverage-reports";
import options from "./coverage-options.mjs";

export default async function coverageTeardown() {
  const report = MCR(options);
  if (!report.hasCache()) {
    throw new Error("No browser coverage collected. Check that tests import the coverage fixture.");
  }
  const results = await report.generate();
  if (!results || !results.files?.length) {
    throw new Error("No application coverage generated. Check fixture imports and source filters.");
  }
}