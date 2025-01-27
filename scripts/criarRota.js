#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var inquirer_1 = require("inquirer");
// Função para criar a rota
var createRoute = function (routePath, roles) {
    console.log("Criando rota para: ".concat(routePath, " com roles: ").concat(roles.join(", ")));
    if (!routePath.startsWith("/")) {
        console.error("O caminho da rota deve começar com '/'. Exemplo: /myEvents");
        process.exit(1);
    }
    var folderName = routePath.slice(1);
    var componentName = folderName.charAt(0).toUpperCase() + folderName.slice(1);
    var baseDir = path.resolve(__dirname, "../app");
    if (!fs.existsSync(baseDir)) {
        console.error("A pasta 'app' n\u00E3o foi encontrada no diret\u00F3rio: ".concat(baseDir));
        process.exit(1);
    }
    var folderPath = path.join(baseDir, folderName);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log("Pasta criada: ".concat(folderPath));
    }
    else {
        console.log("A pasta '".concat(folderName, "' j\u00E1 existe em: ").concat(folderPath));
    }
    var filePath = path.join(folderPath, "page.tsx");
    var fileContent = "const ".concat(componentName, " = () => {\n  return (\n    <div>\n      <h1>").concat(folderName, "</h1>\n    </div>\n  );\n};\n\nexport default ").concat(componentName, ";\n");
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, fileContent);
        console.log("Arquivo page.tsx criado em: ".concat(filePath));
    }
    else {
        console.log("O arquivo page.tsx j\u00E1 existe em: ".concat(filePath));
    }
    updateRolesFile(routePath, roles);
    updateAppSidebar(routePath, componentName, roles);
};
// Atualizar o arquivo roles.ts
var updateRolesFile = function (routePath, roles) {
    var rolesFilePath = path.resolve(__dirname, "../roles.ts");
    if (!fs.existsSync(rolesFilePath)) {
        console.error("O arquivo roles.ts n\u00E3o foi encontrado no diret\u00F3rio: ".concat(rolesFilePath));
        process.exit(1);
    }
    var rolesFileContent = fs.readFileSync(rolesFilePath, "utf-8");
    var updatedContent = roles.reduce(function (content, role) {
        var roleRegex = new RegExp("\\[roles\\.".concat(role, "\\]: \\[(.*?)\\]"));
        return content.replace(roleRegex, function (match, routes) {
            var routesArray = routes.split(",").map(function (route) { return route.trim().replace(/['"]+/g, ""); });
            if (!routesArray.includes(routePath)) {
                routesArray.push(routePath);
            }
            return "[roles.".concat(role, "]: [").concat(routesArray.map(function (route) { return "\"".concat(route, "\""); }).join(", "), "]");
        });
    }, rolesFileContent);
    fs.writeFileSync(rolesFilePath, updatedContent, "utf-8");
    console.log("Arquivo roles.ts atualizado com a rota ".concat(routePath, " para as roles: ").concat(roles.join(", ")));
};
// Atualizar o arquivo app-sidebar.tsx
var updateAppSidebar = function (routePath, componentName, roles) {
    var sidebarFilePath = path.resolve(__dirname, "../components/ui/app-sidebar.tsx" // Caminho correto para o arquivo
    );
    if (!fs.existsSync(sidebarFilePath)) {
        console.error("O arquivo app-sidebar.tsx n\u00E3o foi encontrado no diret\u00F3rio: ".concat(sidebarFilePath));
        process.exit(1);
    }
    var sidebarFileContent = fs.readFileSync(sidebarFilePath, "utf-8");
    roles.forEach(function (role) {
        var roleConditionRegex = new RegExp("\\{session\\?\\.user\\?\\.role === \"".concat(role, "\" && \\(([^]*?)\\)\\}"), "gm");
        if (roleConditionRegex.test(sidebarFileContent)) {
            // Se a role já existe, adiciona o novo botão dentro do bloco
            sidebarFileContent = sidebarFileContent.replace(roleConditionRegex, function (match, sectionContent) {
                var newButton = "          <SidebarMenuItem>\n              <SidebarMenuButton\n                onClick={() => {\n                  router.push(\"".concat(routePath, "\");\n                }}\n                className=\"transition-all rounded-lg px-4 py-2\"\n              >\n                <span className=\"text-foreground\">").concat(componentName, "</span>\n              </SidebarMenuButton>\n            </SidebarMenuItem>\n");
                if (sectionContent.includes(routePath)) {
                    console.log("A rota ".concat(routePath, " j\u00E1 existe na se\u00E7\u00E3o de ").concat(role, "."));
                    return match; // Não adiciona duplicatas
                }
                return match.replace(sectionContent, "".concat(sectionContent).concat(newButton));
            });
        }
        else {
            // Se a role não existe, cria uma nova condição completa
            var newCondition_1 = "\n          {session?.user?.role === \"".concat(role, "\" && (\n            <SidebarMenuItem>\n              <SidebarMenuButton\n                onClick={() => {\n                  router.push(\"").concat(routePath, "\");\n                }}\n                className=\"transition-all rounded-lg px-4 py-2\"\n              >\n                <span className=\"text-foreground\">").concat(componentName, "</span>\n              </SidebarMenuButton>\n            </SidebarMenuItem>\n          )}\n");
            // Adiciona a nova condição no final do SidebarMenu
            var sidebarMenuRegex = /<SidebarMenu>([\s\S]*?)<\/SidebarMenu>/gm;
            sidebarFileContent = sidebarFileContent.replace(sidebarMenuRegex, function (match, menuContent) {
                return "<SidebarMenu>".concat(menuContent).concat(newCondition_1, "</SidebarMenu>");
            });
        }
    });
    fs.writeFileSync(sidebarFilePath, sidebarFileContent, "utf-8");
    console.log("Arquivo app-sidebar.tsx atualizado com a rota ".concat(routePath));
};
// Prompt interativo
var promptForRoles = function () { return __awaiter(void 0, void 0, void 0, function () {
    var rolesFilePath, route, roles;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                rolesFilePath = path.resolve(__dirname, "../roles.ts");
                if (!fs.existsSync(rolesFilePath)) {
                    console.error("O arquivo roles.ts n\u00E3o foi encontrado no diret\u00F3rio: ".concat(rolesFilePath));
                    process.exit(1);
                }
                return [4 /*yield*/, inquirer_1.default.prompt([
                        {
                            type: "input",
                            name: "route",
                            message: "Digite o nome da rota (exemplo: /myEvents):",
                            validate: function (input) { return (input.startsWith("/") ? true : "A rota deve começar com '/'"); },
                        },
                    ])];
            case 1:
                route = (_a.sent()).route;
                return [4 /*yield*/, inquirer_1.default.prompt([
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
                    ])];
            case 2:
                roles = (_a.sent()).roles;
                if (roles.includes("all")) {
                    return [2 /*return*/, { route: route, roles: ["ADMIN", "BASIC", "PROMOTER", "GUEST"] }];
                }
                return [2 /*return*/, { route: route, roles: roles }];
        }
    });
}); };
// Executar o comando
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, route, roles;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, promptForRoles()];
            case 1:
                _a = _b.sent(), route = _a.route, roles = _a.roles;
                createRoute(route, roles);
                return [2 /*return*/];
        }
    });
}); })();
