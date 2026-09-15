import {test,expect} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {hash} from "bcryptjs";
import {randomBytes} from "node:crypto";
const db=new PrismaClient();
const suffix=randomBytes(6).toString("hex"),email=`browser-${suffix}@example.test`,password=randomBytes(18).toString("hex");
let userId="",organizationId="";
test.beforeAll(async()=>{
 if(process.env.RUN_INTEGRATION!=="1")throw new Error("Browser tests require isolated test database.");
 const user=await db.user.create({data:{email,name:"Usuário de teste",passwordHash:await hash(password,12),memberships:{create:{organization:{create:{name:"Teste navegador"}}}}},include:{memberships:true}});
 userId=user.id;organizationId=user.memberships[0].organizationId;
});
test.afterAll(async()=>{if(userId)await db.user.delete({where:{id:userId}});if(organizationId)await db.organization.delete({where:{id:organizationId}});await db.$disconnect();});
test("login, company, filters, alert, responsive dashboard and logout",async({page})=>{
 await page.goto("/dashboard");await expect(page).toHaveURL(/\/login/);
 await page.getByLabel("E-mail",{exact:true}).fill(email);await page.getByLabel("Senha",{exact:true}).fill(password);await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Visão geral"})).toBeVisible();
 await page.getByRole("link",{name:"Empresas",exact:true}).click();await page.getByRole("button",{name:"Nova empresa"}).click();
 await page.getByLabel("Razão social",{exact:true}).fill("Empresa de materiais hospitalares");await page.getByLabel("CNPJ",{exact:true}).fill("11222333000181");
 await page.getByLabel("Palavras-chave, separadas por vírgula",{exact:true}).fill("hospitalar, equipamento");await page.getByLabel("UFs atendidas, separadas por vírgula",{exact:true}).fill("PE");
 await page.getByRole("button",{name:"Salvar perfil",exact:true}).click();await expect(page.getByRole("heading",{name:"Empresa de materiais hospitalares"})).toBeVisible();
 await page.getByRole("link",{name:"Oportunidades",exact:true}).click();await page.getByRole("button",{name:"Filtros",exact:true}).click();await page.getByLabel("UF",{exact:true}).fill("PE");await page.getByRole("button",{name:"Pesquisar",exact:true}).click();await expect(page.getByText(/oportunidades encontradas/)).toBeVisible();
 await page.getByRole("link",{name:"Alertas",exact:true}).click();await page.getByRole("button",{name:"Criar alerta",exact:true}).click();await page.getByLabel("Nome",{exact:true}).fill("Material hospitalar em Pernambuco");await page.getByLabel("Palavras-chave (vírgulas)",{exact:true}).fill("hospitalar");await page.getByLabel("UF",{exact:true}).fill("PE");await page.getByRole("button",{name:"Salvar alerta",exact:true}).click();await expect(page.getByRole("heading",{name:"Material hospitalar em Pernambuco"})).toBeVisible();
 await page.getByRole("link",{name:"Dashboard",exact:true}).click();await expect(page.getByText("Com prazo futuro",{exact:true})).toBeVisible();await page.screenshot({path:"test-results/dashboard-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:"test-results/dashboard-mobile.png",fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.getByRole("button",{name:"Abrir menu",exact:true}).click();await page.getByRole("button",{name:"Sair",exact:true}).click();await expect(page).toHaveURL(/\/login/);
});
test("login links to accessible registration form",async({page})=>{
 await page.goto("/login");await page.getByRole("link",{name:"Criar conta",exact:true}).click();
 await expect(page).toHaveURL(/\/cadastro/);
 await expect(page.getByLabel("Nome completo",{exact:true})).toBeVisible();
 await expect(page.getByLabel("Confirmar senha",{exact:true})).toHaveAttribute("minlength","12");
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.getByRole("link",{name:"Voltar ao login",exact:true}).click();await expect(page).toHaveURL(/\/login/);
});
