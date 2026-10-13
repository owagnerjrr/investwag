import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../server/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("E2E requires a dedicated _test database");
const db = new PrismaClient();
const prefix = "e2e-" + crypto.randomUUID();
const password = "E2E-Demo-Password-2026";
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.$disconnect();
});
async function login(page, email) {
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minha carteira" }),
  ).toBeVisible();
}
test("cadastro, carteira, validações, pausa, recarga e isolamento", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `${prefix}-${info.project.name}@example.test`;
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta demonstrativa" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Cadastrar e entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "Minha carteira" }),
  ).toBeVisible();
  await expect(page.locator(".hero h2")).toContainText("0,00");
  await page.getByLabel("Valor em reais").fill("9,99");
  await page
    .getByRole("button", { name: "Simular aporte", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("mínimo");
  await page.getByLabel("Valor em reais").fill("100,25");
  await page
    .getByRole("button", { name: "Simular aporte", exact: true })
    .click();
  await expect(page.locator(".hero h2")).toContainText("100,25");
  await page.getByLabel("Valor em reais").fill("100,26");
  await page
    .getByRole("button", { name: "Simular retirada", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Saldo insuficiente");
  await page.getByLabel("Valor em reais").fill("10,25");
  await page
    .getByRole("button", { name: "Simular retirada", exact: true })
    .click();
  await expect(page.locator(".hero h2")).toContainText("90,00");
  await expect(page.locator(".history li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Reativar sistema", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pausar sistema", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pausar sistema", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reativar sistema", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 393, height: 851 });
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Acessar demonstração" }),
  ).toBeVisible();
  await login(page, email);
  await expect(page.locator(".hero h2")).toContainText("90,00");
  await expect(page.locator(".history li")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Reativar sistema" }),
  ).toBeVisible();
  // Expire the server session and ensure the UI returns to login on the next action.
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await db.session.updateMany({
    where: { userId: user.id },
    data: { expiresAt: new Date(0) },
  });
  await page.getByRole("button", { name: "Atualizar saldo" }).click();
  await expect(
    page.getByRole("heading", { name: "Acessar demonstração" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Sessão expirada");
  await login(page, email);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acessar demonstração" }),
  ).toBeVisible();
  const other = `${prefix}-${info.project.name}-other@example.test`;
  await page.getByRole("button", { name: "Criar conta demonstrativa" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(other);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Cadastrar e entrar" }).click();
  await expect(page.locator(".hero h2")).toContainText("0,00");
  await expect(page.locator(".history li")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const lostResponse of ["movement", "portfolio", "html"])
  test(`resposta perdida (${lostResponse}) pode ser repetida sem duplicar o aporte`, async ({
    page,
  }, info) => {
    const email = `${prefix}-${info.project.name}-retry-${lostResponse}@example.test`;
    await page.request.post("http://127.0.0.1:4000/auth/register", {
      data: { email, password },
    });
    await page.goto("/");
    await login(page, email);
    let first = true;
    await page.route(
      lostResponse === "portfolio" ? "**/portfolio" : "**/portfolio/movements",
      async (route) => {
        if (!first) return route.continue();
        first = false;
        const response = await route.fetch();
        expect(response.status()).toBe(
          lostResponse === "portfolio" ? 200 : 201,
        );
        if (lostResponse === "html")
          return route.fulfill({
            status: 200,
            contentType: "text/html",
            body: "Starting service",
          });
        await route.abort("failed");
      },
    );
    await page
      .getByRole("button", { name: "Simular aporte", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirmar operação pendente" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Confirmar operação pendente" })
      .click();
    await expect(page.locator(".hero h2")).toContainText("10,00");
    await expect(page.locator(".history li")).toHaveCount(1);
  });

test("aguarda API gratuita despertar antes de enviar o cadastro uma única vez", async ({
  page,
}, info) => {
  let probes = 0,
    registrations = 0;
  await page.route("**/health", async (route) => {
    if (++probes === 1)
      return route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "Starting service",
      });
    return route.continue();
  });
  await page.route("**/auth/register", async (route) => {
    registrations++;
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta demonstrativa" }).click();
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(`${prefix}-${info.project.name}-wake@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Cadastrar e entrar" }).click();
  await expect(
    page.getByText(/API gratuita pode estar despertando/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Minha carteira" }),
  ).toBeVisible();
  expect(registrations).toBe(1);
  expect(probes).toBeGreaterThan(1);
});
