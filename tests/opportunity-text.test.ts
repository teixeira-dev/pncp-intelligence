import {expect,it} from "vitest";
import {officialText,excerpt} from "../src/lib/opportunity-text";
it("formats whitespace while preserving official wording",()=>{expect(officialText("  Aquisição   de\r\nmaterial hospitalar.  ")).toBe("Aquisição de\nmaterial hospitalar.");expect(excerpt("Aquisição de material hospitalar",18)).toBe("Aquisição de…");});
