import { lstatSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

function updateImportStatements(dir, changes) {
  const files = readdirSync(dir);

  files.forEach((file) => {
    const filePath = join(dir, file);
    const stat = lstatSync(filePath);

    if (stat.isDirectory() && !filePath.includes("node_modules")) {
      updateImportStatements(filePath, changes);
    } else if (file.endsWith(".js") || file.endsWith(".ts") || file.endsWith(".tsx")) {
      let content = readFileSync(filePath, "utf8");
      let modified = false;
      let newContent = [];
      let isImportLine = false;
      let accumulatedImport = "";

      content.split("\n").forEach((line) => {
        if (isImportLine || line.trim().startsWith("import") || line.trim().startsWith("export")) {
          accumulatedImport += line + "\n";
          // Check if the import statement closes on this line
          if (line.includes(";")) {
            changes.forEach((change) => {
              const importRegex = new RegExp(`(['"])${change.old}\\1`, "g");
              if (importRegex.test(accumulatedImport)) {
                accumulatedImport = accumulatedImport.replace(importRegex, `$1${change.new}$1`);
                modified = true;
              }
            });
            newContent.push(accumulatedImport.trim());
            accumulatedImport = "";
            isImportLine = false;
          } else {
            isImportLine = true; // Continue accumulating lines
          }
        } else {
          newContent.push(line);
        }
      });

      if (modified) {
        writeFileSync(filePath, newContent.join("\n"), "utf8");
        console.log(`Updated references in ${filePath}`);
      }
    }
  });
}

const rootDir = resolve(process.argv[2] || ".");
const changes = JSON.parse(readFileSync("renamed-packages.json", "utf8"));
updateImportStatements(rootDir, changes);
