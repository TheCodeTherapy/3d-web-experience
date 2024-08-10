import fs from "fs";
import https from "https";
import path from "path";

// URL of the renamed-packages.json to download
const jsonUrl =
  "https://raw.githubusercontent.com/TheCodeTherapy/mml/publish-exp/renamed-packages.json";
const localJsonPath = path.resolve(process.cwd(), "renamed-packages.json");

function downloadRenamedPackages() {
  return new Promise((resolve, reject) => {
    const request = https.get(jsonUrl, (response) => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        reject(new Error(`Failed to fetch ${jsonUrl}: Status Code: ${response.statusCode}`));
        return;
      }

      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          const jsonContent = JSON.parse(body);
          fs.writeFileSync(localJsonPath, JSON.stringify(jsonContent, null, 2));
          console.log("Downloaded and updated renamed-packages.json");
          resolve(jsonContent);
        } catch (e) {
          reject(e);
        }
      });
    });

    request.on("error", (err) => reject(err));
  });
}

// Function to update package.json
function updatePackageJson(filePath, renamedPackages) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let isUpdated = false;

  ["dependencies", "devDependencies", "peerDependencies"].forEach((type) => {
    if (data[type]) {
      Object.keys(data[type]).forEach((dep) => {
        const matchedPackage = renamedPackages.find((pkg) => pkg.old === dep);
        if (matchedPackage) {
          const newVersion = data[type][dep];
          delete data[type][dep]; // Remove old dependency
          data[type][matchedPackage.new] = newVersion; // Add new dependency
          isUpdated = true;
        }
      });
    }
  });

  if (isUpdated) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); // Write updated JSON back to package.json
    console.log(`Updated references in ${filePath}`);
  }
}

// Function to recursively traverse directories
function traverseDirectories(directory, renamedPackages) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((dirent) => {
    const resolvedPath = path.resolve(directory, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name !== "node_modules") {
        // Skip node_modules directory
        traverseDirectories(resolvedPath, renamedPackages);
      }
    } else if (dirent.name === "package.json") {
      updatePackageJson(resolvedPath, renamedPackages);
    }
  });
}

// Main function to orchestrate download and update
async function main() {
  try {
    const renamedPackages = await downloadRenamedPackages();
    const startDirectory = process.argv[2] || process.cwd();
    traverseDirectories(startDirectory, renamedPackages);
  } catch (error) {
    console.error(`Failed to download or process renamed-packages.json: ${error}`);
  }
}

main();
