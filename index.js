import { input, password, select, confirm, checkbox, search } from "@inquirer/prompts";
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";
import dotenv from "dotenv";
import chalk from "chalk";

// Load environment variables from .env file
dotenv.config();

async function main() {
  console.log("\n" + chalk.bold.cyan("╔════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║") + chalk.bold.white("   GitHub Repository Metadata Generator         ") + chalk.bold.cyan("║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝") + "\n");

  // Get API tokens from environment or prompt
  let githubToken = process.env.GITHUB_TOKEN;
  let openaiApiKey = process.env.OPENAI_API_KEY;

  if (githubToken) {
    console.log(chalk.green("✓") + " GitHub token loaded from environment");
  } else {
    githubToken = await password({
      message: "Enter your GitHub Personal Access Token:",
      mask: "*",
    });
  }

  if (openaiApiKey) {
    console.log(chalk.green("✓") + " OpenAI API key loaded from environment");
  } else {
    openaiApiKey = await password({
      message: "Enter your OpenAI API Key:",
      mask: "*",
    });
  }

  // Initialize clients
  const octokit = new Octokit({ auth: githubToken });
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Fetch user info and repositories
  console.log("\n" + chalk.yellow("⏳") + " Fetching your repositories...\n");

  let user;
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    user = data;
  } catch (error) {
    console.error(chalk.red("✗") + " Error: Invalid GitHub token or API error.");
    process.exit(1);
  }

  // Fetch all repositories (handling pagination)
  let allRepos = [];
  let page = 1;
  while (true) {
    const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      page,
      sort: "updated",
    });
    if (repos.length === 0) break;
    allRepos = allRepos.concat(repos);
    page++;
  }

  if (allRepos.length === 0) {
    console.log(chalk.red("✗") + " No repositories found.");
    process.exit(0);
  }

  console.log(chalk.green("✓") + ` Found ${chalk.bold(allRepos.length)} repositories\n`);

  // Calculate column widths for table display
  const maxNameLen = Math.min(30, Math.max(...allRepos.map(r => r.name.length)));
  const maxLangLen = Math.min(15, Math.max(...allRepos.map(r => (r.language || "--").length)));

  // Format relative time for "Last Updated" column
  const formatRelativeTime = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  };

  // Display repositories in table column format
  const displayRepositoriesTable = (repos) => {
    // Box drawing characters for better visual styling
    const box = {
      topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘",
      horizontal: "─", vertical: "│", teeDown: "┬", teeUp: "┴", teeRight: "├", teeLeft: "┤", cross: "┼"
    };

    // Column definitions with widths
    const cols = {
      name: maxNameLen + 2,
      lang: maxLangLen + 2,
      stars: 7,
      forks: 7,
      updated: 12,
      visibility: 10,
      desc: 30
    };

    const totalWidth = Object.values(cols).reduce((a, b) => a + b, 0) + Object.keys(cols).length + 1;

    // Build header row
    const headerLabels = [
      " Name".padEnd(cols.name),
      "Language".padEnd(cols.lang),
      "★ Stars".padEnd(cols.stars),
      "⑂ Forks".padEnd(cols.forks),
      "Updated".padEnd(cols.updated),
      "Visibility".padEnd(cols.visibility),
      "Description".padEnd(cols.desc)
    ];

    // Top border
    const topBorder = chalk.dim(
      box.topLeft +
      [cols.name, cols.lang, cols.stars, cols.forks, cols.updated, cols.visibility, cols.desc]
        .map(w => box.horizontal.repeat(w))
        .join(box.teeDown) +
      box.topRight
    );

    // Header separator
    const headerSep = chalk.dim(
      box.teeRight +
      [cols.name, cols.lang, cols.stars, cols.forks, cols.updated, cols.visibility, cols.desc]
        .map(w => box.horizontal.repeat(w))
        .join(box.cross) +
      box.teeLeft
    );

    // Bottom border
    const bottomBorder = chalk.dim(
      box.bottomLeft +
      [cols.name, cols.lang, cols.stars, cols.forks, cols.updated, cols.visibility, cols.desc]
        .map(w => box.horizontal.repeat(w))
        .join(box.teeUp) +
      box.bottomRight
    );

    console.log(topBorder);
    console.log(
      chalk.dim(box.vertical) +
      headerLabels.map(h => chalk.bold.white(h)).join(chalk.dim(box.vertical)) +
      chalk.dim(box.vertical)
    );
    console.log(headerSep);

    repos.slice(0, 15).forEach((repo, idx) => {
      const name = chalk.bold.cyan(repo.name.substring(0, cols.name - 1).padEnd(cols.name));
      const language = repo.language
        ? chalk.blue(repo.language.padEnd(cols.lang))
        : chalk.gray("--".padEnd(cols.lang));
      const stars = chalk.yellow(String(repo.stargazers_count).padEnd(cols.stars));
      const forks = chalk.magenta(String(repo.forks_count).padEnd(cols.forks));
      const updated = chalk.green(formatRelativeTime(repo.pushed_at).padEnd(cols.updated));
      const visibility = repo.private
        ? chalk.yellow("private".padEnd(cols.visibility))
        : chalk.green("public".padEnd(cols.visibility));
      const descText = repo.description
        ? repo.description.substring(0, cols.desc - 3) + (repo.description.length > cols.desc - 3 ? "..." : "")
        : "No description";
      const desc = repo.description
        ? chalk.gray(descText.padEnd(cols.desc))
        : chalk.dim.gray(descText.padEnd(cols.desc));

      console.log(
        chalk.dim(box.vertical) +
        `${name}${chalk.dim(box.vertical)}${language}${chalk.dim(box.vertical)}${stars}${chalk.dim(box.vertical)}${forks}${chalk.dim(box.vertical)}${updated}${chalk.dim(box.vertical)}${visibility}${chalk.dim(box.vertical)}${desc}` +
        chalk.dim(box.vertical)
      );
    });

    if (repos.length > 15) {
      console.log(headerSep);
      const moreMsg = `  ... and ${repos.length - 15} more repositories`;
      console.log(chalk.dim(box.vertical) + chalk.dim.italic(moreMsg.padEnd(totalWidth - 2)) + chalk.dim(box.vertical));
    }
    console.log(bottomBorder);
  };

  // Display table of repositories
  console.log(chalk.bold.cyan("\n📋 Your Repositories:\n"));
  displayRepositoriesTable(allRepos);

  // Helper function to format repository for search results
  const formatRepoChoice = (repo) => {
    // Fixed column widths for alignment
    const nameWidth = 28;
    const langWidth = 12;
    const statsWidth = 14;

    // Repository name (padded for alignment)
    const name = repo.name.length > nameWidth - 1
      ? repo.name.substring(0, nameWidth - 2) + "…"
      : repo.name;
    const namePadded = chalk.bold.cyan(name.padEnd(nameWidth));

    // Language tag
    const langText = repo.language || "—";
    const language = repo.language
      ? chalk.blue(langText.padEnd(langWidth))
      : chalk.dim.gray(langText.padEnd(langWidth));

    // Stats (stars and forks)
    const starsText = `★${String(repo.stargazers_count).padStart(4)}`;
    const forksText = `⑂${String(repo.forks_count).padStart(4)}`;
    const stats = chalk.yellow(starsText) + " " + chalk.magenta(forksText);

    // Visibility indicator
    const visibility = repo.private
      ? chalk.yellow("●")
      : chalk.green("○");

    // Description (truncated)
    const descText = repo.description
      ? repo.description.substring(0, 40) + (repo.description.length > 40 ? "…" : "")
      : "No description";
    const description = repo.description
      ? chalk.gray(descText)
      : chalk.dim.gray(descText);

    return `${visibility} ${namePadded} ${language} ${stats}  ${chalk.dim("│")} ${description}`;
  };

  // Let user search and select a repository
  console.log(chalk.dim("\nType to search repositories by name, language, or description:"));
  console.log(chalk.dim("  ○/● Name                         Language     Stars Forks │ Description"));
  console.log(chalk.dim("  ─────────────────────────────────────────────────────────────────────────────\n"));

  const selectedRepo = await search({
    message: chalk.cyan("Search and select a repository:"),
    source: async (input) => {
      const searchTerm = (input || "").toLowerCase();
      const filtered = allRepos.filter((repo) => {
        if (!searchTerm) return true;
        return (
          repo.name.toLowerCase().includes(searchTerm) ||
          (repo.language || "").toLowerCase().includes(searchTerm) ||
          (repo.description || "").toLowerCase().includes(searchTerm)
        );
      });
      return filtered.map((repo) => ({
        name: formatRepoChoice(repo),
        value: repo,
      }));
    },
    pageSize: 15,
  });

  console.log("\n" + chalk.green("✓") + ` Selected: ${chalk.bold.white(selectedRepo.full_name)}\n`);

  // Check what's missing
  const missing = [];
  if (!selectedRepo.description || selectedRepo.description.trim() === "") {
    missing.push("description");
  }
  if (!selectedRepo.homepage || selectedRepo.homepage.trim() === "") {
    missing.push("website");
  }
  if (!selectedRepo.topics || selectedRepo.topics.length === 0) {
    missing.push("topics");
  }

  // Check if README exists
  let hasReadme = false;
  try {
    await octokit.rest.repos.getReadme({
      owner: selectedRepo.owner.login,
      repo: selectedRepo.name,
    });
    hasReadme = true;
  } catch (error) {
    if (error.status === 404) {
      missing.push("README.md");
    }
  }

  if (missing.length === 0) {
    console.log(chalk.green("✓") + " This repository already has all metadata fields populated!");
    const continueAnyway = await confirm({
      message: chalk.cyan("Would you like to regenerate any fields anyway?"),
      default: false,
    });
    if (!continueAnyway) {
      process.exit(0);
    }
  } else {
    console.log(chalk.yellow("⚠") + ` Missing fields: ${chalk.bold(missing.join(", "))}`);
  }

  // Let user select which fields to generate
  const fieldsToGenerate = await checkbox({
    message: chalk.cyan("Select which fields to generate:"),
    choices: [
      {
        name: "Description",
        value: "description",
        checked: missing.includes("description"),
      },
      {
        name: "Website",
        value: "website",
        checked: missing.includes("website"),
      },
      {
        name: "Topics",
        value: "topics",
        checked: missing.includes("topics"),
      },
      {
        name: "README.md",
        value: "readme",
        checked: missing.includes("README.md"),
      },
    ],
  });

  if (fieldsToGenerate.length === 0) {
    console.log(chalk.yellow("⚠") + " No fields selected. Exiting.");
    process.exit(0);
  }

  // Fetch repository content for context
  console.log("\n" + chalk.yellow("⏳") + " Analyzing repository content...\n");
  let repoContext = await getRepositoryContext(octokit, selectedRepo);

  // Generate metadata using OpenAI
  const generatedData = {};

  if (fieldsToGenerate.includes("description")) {
    console.log(chalk.blue("⟳") + " Generating description...");
    generatedData.description = await generateDescription(openai, repoContext);
    console.log(chalk.green("  ✓") + ` ${chalk.white(generatedData.description)}\n`);
  }

  if (fieldsToGenerate.includes("website")) {
    console.log(chalk.blue("⟳") + " Generating website suggestion...");
    generatedData.website = await generateWebsite(openai, repoContext);
    console.log(chalk.green("  ✓") + ` ${chalk.cyan.underline(generatedData.website)}\n`);
  }

  if (fieldsToGenerate.includes("topics")) {
    console.log(chalk.blue("⟳") + " Generating topics...");
    generatedData.topics = await generateTopics(openai, repoContext);
    console.log(chalk.green("  ✓") + ` ${chalk.magenta(generatedData.topics.join(", "))}\n`);
  }

  if (fieldsToGenerate.includes("readme")) {
    console.log(chalk.blue("⟳") + " Generating README.md...");
    generatedData.readme = await generateReadme(openai, repoContext);
    console.log(chalk.green("  ✓") + " README.md content generated\n");
  }

  // Confirm before applying
  console.log("\n" + chalk.bold.cyan("╔════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║") + chalk.bold.white("           Generated Metadata Summary           ") + chalk.bold.cyan("║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝") + "\n");

  if (generatedData.description) {
    console.log(chalk.bold.white("📝 Description:"));
    console.log(chalk.gray("   " + generatedData.description) + "\n");
  }
  if (generatedData.website) {
    console.log(chalk.bold.white("🔗 Website:"));
    console.log(chalk.cyan.underline("   " + generatedData.website) + "\n");
  }
  if (generatedData.topics) {
    console.log(chalk.bold.white("🏷️  Topics:"));
    console.log("   " + generatedData.topics.map(t => chalk.magenta(`#${t}`)).join("  ") + "\n");
  }
  if (generatedData.readme) {
    console.log(chalk.bold.white(`📄 README.md: `) + chalk.gray(`(${generatedData.readme.length} characters)`));
    console.log(chalk.dim("   ─────────────────────────────────────────────"));
    const previewLines = generatedData.readme.substring(0, 400).split("\n").slice(0, 8);
    previewLines.forEach(line => console.log(chalk.gray("   " + line)));
    console.log(chalk.dim("   ─────────────────────────────────────────────\n"));
  }

  const applyChanges = await confirm({
    message: chalk.cyan("Apply these changes to the repository?"),
    default: true,
  });

  if (!applyChanges) {
    console.log(chalk.yellow("⚠") + " Changes cancelled.");
    process.exit(0);
  }

  // Apply changes
  console.log("\n" + chalk.yellow("⏳") + " Applying changes...\n");

  try {
    // Update repository metadata (description, website)
    if (generatedData.description || generatedData.website) {
      const updateData = {};
      if (generatedData.description) {
        updateData.description = generatedData.description;
      }
      if (generatedData.website) {
        updateData.homepage = generatedData.website;
      }

      await octokit.rest.repos.update({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        ...updateData,
      });
      console.log(chalk.green("  ✓") + " Updated repository description/website");
    }

    // Update topics
    if (generatedData.topics) {
      await octokit.rest.repos.replaceAllTopics({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        names: generatedData.topics,
      });
      console.log(chalk.green("  ✓") + " Updated repository topics");
    }

    // Create README.md
    if (generatedData.readme) {
      try {
        // Check if README already exists
        const { data: existingReadme } = await octokit.rest.repos
          .getReadme({
            owner: selectedRepo.owner.login,
            repo: selectedRepo.name,
          })
          .catch(() => ({ data: null }));

        if (existingReadme) {
          // Update existing README
          await octokit.rest.repos.createOrUpdateFileContents({
            owner: selectedRepo.owner.login,
            repo: selectedRepo.name,
            path: "README.md",
            message: "Update README.md via metadata generator",
            content: Buffer.from(generatedData.readme).toString("base64"),
            sha: existingReadme.sha,
          });
        } else {
          // Create new README
          await octokit.rest.repos.createOrUpdateFileContents({
            owner: selectedRepo.owner.login,
            repo: selectedRepo.name,
            path: "README.md",
            message: "Add README.md via metadata generator",
            content: Buffer.from(generatedData.readme).toString("base64"),
          });
        }
        console.log(chalk.green("  ✓") + " Created/Updated README.md");
      } catch (error) {
        console.error(chalk.red("  ✗") + ` Error creating README: ${error.message}`);
      }
    }

    console.log("\n" + chalk.bold.green("╔════════════════════════════════════════════════╗"));
    console.log(chalk.bold.green("║") + chalk.bold.white("     All changes applied successfully! 🎉      ") + chalk.bold.green("║"));
    console.log(chalk.bold.green("╚════════════════════════════════════════════════╝") + "\n");
  } catch (error) {
    console.error(chalk.red("✗") + ` Error applying changes: ${error.message}`);
    process.exit(1);
  }
}

async function getRepositoryContext(octokit, repo) {
  const context = {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description || "",
    language: repo.language || "Unknown",
    topics: repo.topics || [],
    isPrivate: repo.private,
    defaultBranch: repo.default_branch,
    files: [],
    packageJson: null,
  };

  try {
    // Get repository tree
    const { data: tree } = await octokit.rest.git.getTree({
      owner: repo.owner.login,
      repo: repo.name,
      tree_sha: repo.default_branch,
      recursive: "1",
    });

    context.files = tree.tree
      .filter((item) => item.type === "blob")
      .map((item) => item.path)
      .slice(0, 100); // Limit to 100 files for context

    // Try to get package.json for Node.js projects
    try {
      const { data: packageJson } = await octokit.rest.repos.getContent({
        owner: repo.owner.login,
        repo: repo.name,
        path: "package.json",
      });
      if (packageJson.content) {
        context.packageJson = JSON.parse(
          Buffer.from(packageJson.content, "base64").toString()
        );
      }
    } catch (e) {
      // No package.json
    }

    // Try to get other common config files
    const configFiles = [
      "Cargo.toml",
      "pyproject.toml",
      "setup.py",
      "go.mod",
      "pom.xml",
      "build.gradle",
    ];

    for (const configFile of configFiles) {
      try {
        const { data: config } = await octokit.rest.repos.getContent({
          owner: repo.owner.login,
          repo: repo.name,
          path: configFile,
        });
        if (config.content) {
          context.configFile = {
            name: configFile,
            content: Buffer.from(config.content, "base64").toString(),
          };
          break;
        }
      } catch (e) {
        // Config file doesn't exist
      }
    }
  } catch (error) {
    console.log(chalk.yellow("  ⚠") + " Warning: Could not fetch full repository context");
  }

  return context;
}

async function generateDescription(openai, context) {
  const prompt = `Generate a concise, professional GitHub repository description (max 150 characters) for a repository with the following details:

Repository name: ${context.name}
Primary language: ${context.language}
Current topics: ${context.topics.join(", ") || "None"}
Files in repository: ${context.files.slice(0, 20).join(", ")}
${context.packageJson ? `Package.json name: ${context.packageJson.name}, description: ${context.packageJson.description || "None"}` : ""}
${context.configFile ? `Config file (${context.configFile.name}): ${context.configFile.content.substring(0, 500)}` : ""}

Return ONLY the description text, no quotes or extra formatting.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 100,
    temperature: 0.7,
  });

  return response.choices[0].message.content.trim().substring(0, 350);
}

async function generateWebsite(openai, context) {
  const prompt = `Suggest the most appropriate website URL for a GitHub repository with these details:

Repository name: ${context.name}
Full name: ${context.fullName}
Primary language: ${context.language}
${context.packageJson ? `Package name: ${context.packageJson.name}` : ""}

If this appears to be an npm package, suggest the npmjs.com URL.
If it's a Python package, suggest PyPI URL.
If it could have GitHub Pages, suggest that.
Otherwise, suggest a reasonable documentation or project URL.

Return ONLY the URL, nothing else.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 100,
    temperature: 0.7,
  });

  return response.choices[0].message.content.trim();
}

async function generateTopics(openai, context) {
  const prompt = `Generate 5-10 relevant GitHub topics (tags) for a repository with these details:

Repository name: ${context.name}
Primary language: ${context.language}
Current description: ${context.description || "None"}
Files in repository: ${context.files.slice(0, 30).join(", ")}
${context.packageJson ? `Package.json dependencies: ${Object.keys(context.packageJson.dependencies || {}).slice(0, 10).join(", ")}` : ""}
${context.configFile ? `Config file (${context.configFile.name}): ${context.configFile.content.substring(0, 300)}` : ""}

Rules for topics:
- All lowercase
- Use hyphens instead of spaces
- No special characters
- Keep each topic under 50 characters
- Include the primary programming language as a topic

Return ONLY a comma-separated list of topics, nothing else.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 150,
    temperature: 0.7,
  });

  const topicsText = response.choices[0].message.content.trim();
  return topicsText
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter((t) => t.length > 0 && t.length <= 50)
    .slice(0, 10);
}

async function generateReadme(openai, context) {
  const prompt = `Generate a professional README.md for a GitHub repository with these details:

Repository name: ${context.name}
Full name: ${context.fullName}
Primary language: ${context.language}
Description: ${context.description || "A software project"}
Topics: ${context.topics.join(", ") || "None specified"}
Files in repository: ${context.files.slice(0, 50).join(", ")}
${context.packageJson ? `Package.json: ${JSON.stringify({ name: context.packageJson.name, description: context.packageJson.description, scripts: context.packageJson.scripts }, null, 2)}` : ""}
${context.configFile ? `Config file (${context.configFile.name}): ${context.configFile.content.substring(0, 500)}` : ""}

Include these sections:
1. Project title and description
2. Features (based on the files and structure)
3. Installation instructions
4. Usage examples
5. Contributing guidelines
6. License section

Make it professional and well-formatted with proper Markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2000,
    temperature: 0.7,
  });

  return response.choices[0].message.content.trim();
}

// Run the application
main().catch((error) => {
  console.error(chalk.red("✗") + ` Fatal error: ${error.message}`);
  process.exit(1);
});
