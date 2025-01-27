#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";

// Função para criar a rota
const createRoute = (routePath: string, roles: string[]) => {
  console.log(`Criando rota para: ${routePath} com roles: ${roles.join(", ")}`);

  if (!routePath.startsWith("/")) {
    console.error("O caminho da rota deve começar com '/'. Exemplo: /myEvents");
    process.exit(1);
  }

  const folderName = routePath.slice(1);
  const componentName = folderName.charAt(0).toUpperCase() + folderName.slice(1);

  const baseDir = path.resolve(__dirname, "../app");

  if (!fs.existsSync(baseDir)) {
    console.error(`A pasta 'app' não foi encontrada no diretório: ${baseDir}`);
    process.exit(1);
  }

  const folderPath = path.join(baseDir, folderName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Pasta criada: ${folderPath}`);
  } else {
    console.log(`A pasta '${folderName}' já existe em: ${folderPath}`);
  }

  const filePath = path.join(folderPath, "page.tsx");
  const fileContent = `const ${componentName} = () => {
  return (
    <div>
      <h1>${folderName}</h1>
    </div>
  );
};

export default ${componentName};
`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fileContent);
    console.log(`Arquivo page.tsx criado em: ${filePath}`);
  } else {
    console.log(`O arquivo page.tsx já existe em: ${filePath}`);
  }

  updateRolesFile(routePath, roles);
};

// Atualizar o arquivo roles.ts
const updateRolesFile = (routePath: string, roles: string[]) => {
  const rolesFilePath = path.resolve(__dirname, "../roles.ts");

  if (!fs.existsSync(rolesFilePath)) {
    console.error(`O arquivo roles.ts não foi encontrado no diretório: ${rolesFilePath}`);
    process.exit(1);
  }

  const rolesFileContent = fs.readFileSync(rolesFilePath, "utf-8");

  const updatedContent = roles.reduce((content, role) => {
    const roleRegex = new RegExp(`\\[roles\\.${role}\\]: \\[(.*?)\\]`);
    return content.replace(roleRegex, (match, routes) => {
      const routesArray = routes.split(",").map((route) => route.trim().replace(/['"]+/g, ""));
      if (!routesArray.includes(routePath)) {
        routesArray.push(routePath);
      }
      return `[roles.${role}]: [${routesArray.map((route) => `"${route}"`).join(", ")}]`;
    });
  }, rolesFileContent);

  fs.writeFileSync(rolesFilePath, updatedContent, "utf-8");
  console.log(`Arquivo roles.ts atualizado com a rota ${routePath} para as roles: ${roles.join(", ")}`);
};

// Atualizar o arquivo app-sidebar.tsx




// Prompt interativo
const promptForRoles = async (): Promise<{ route: string; roles: string[] }> => {
  const rolesFilePath = path.resolve(__dirname, "../roles.ts");

  if (!fs.existsSync(rolesFilePath)) {
    console.error(`O arquivo roles.ts não foi encontrado no diretório: ${rolesFilePath}`);
    process.exit(1);
  }

  const { route } = await inquirer.prompt<{ route: string }>([
    {
      type: "input",
      name: "route",
      message: "Digite o nome da rota (exemplo: /myEvents):",
      validate: (input) => (input.startsWith("/") ? true : "A rota deve começar com '/'"),
    },
  ]);

  const { roles } = await inquirer.prompt<{ roles: string[] }>([
    {
      type: "checkbox",
      name: "roles",
      message: "Selecione as roles que terão acesso à rota:",
      choices: [
        { name: "ADMIN", value: "ADMIN" },
        { name: "BASIC", value: "BASIC" },
        { name: "PROMOTER", value: "PROMOTER" },
        { name: "GUEST", value: "GUEST" },
        { name: "Todas as Roles", value: "all" },
      ],
    },
  ]);

  if (roles.includes("all")) {
    return { route, roles: ["ADMIN", "BASIC", "PROMOTER", "GUEST"] };
  }

  return { route, roles };
};

// Executar o comando
(async () => {
  const { route, roles } = await promptForRoles();
  createRoute(route, roles);
})();
