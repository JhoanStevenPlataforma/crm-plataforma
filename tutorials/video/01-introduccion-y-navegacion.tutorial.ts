import { test } from "../studio";
import { draftQuote, openForBusiness, setBaseCurrency } from "../quotes/scene";

/**
 * Part 1 of the product video (docs/video/estructura-video.md, modules 1-2):
 * what the CRM is for and how it is laid out.
 *
 * Goal: a viewer knows what the product does, for whom, and where each area
 * of the menu is.
 * Starts from: a company with a deal and a draft quotation, so no screen of
 * the tour is empty.
 * Ends with: the dashboard, after one pass over every entry of the sidebar.
 */
test.use({
  eyebrow: "Hermes CRM · Video del producto",
  presenterRole: "admin",
});

test("video-01-introduccion-y-navegacion", async ({
  studio,
  createProduct,
  createPriceList,
  createCompany,
  createContact,
  createDeal,
  createLead,
  createQuote,
  taxRateByCode,
}) => {
  const { page, director, presenterId } = studio;
  await setBaseCurrency();
  const business = await openForBusiness(
    {
      createProduct,
      createPriceList,
      createCompany,
      createContact,
      createDeal,
      taxRateByCode,
    } as never,
    presenterId,
  );
  await draftQuote(createQuote, business, presenterId);
  await createLead({
    first_name: "Andrés",
    last_name: "Molina",
    company_name: "Constructora Sabana",
    sales_id: presenterId,
  } as never);

  const menu = (name: string) =>
    page.getByRole("link", { name, exact: true }).first();
  const visit = async (name: string) => {
    await director.click(menu(name));
    await director.pause(1100);
  };

  await studio.open(
    "/",
    "Hermes CRM",
    "Del primer contacto a la cotización aceptada, con evidencia de cada paso.",
  );

  await director.step(
    "Hermes CRM reúne en un solo lugar lo que una venta entre empresas suele tener repartido: prospectos, oportunidades, tareas, cotizaciones y correo.",
  );
  await director.step(
    "Lo usan tres perfiles: el comercial, el responsable de ventas y el administrador. El cliente participa desde un enlace, sin cuenta.",
  );
  await director.step(
    "Su lógica es simple: cada registro tiene un propietario, y cada cambio de estado deja historia.",
  );

  await director.chapter(
    "Navegación",
    "Siete secciones en el menú lateral, de la venta a la configuración.",
  );

  await director.step(
    "Inicio es el panel de control: pipeline, ganado, tasa de ganado y tareas abiertas.",
    async () => {
      await director.highlight(menu("Panel de control"), 1500);
    },
  );

  await director.step(
    "Ventas empieza por los leads: los prospectos que aún no son clientes.",
    async () => {
      await visit("Leads");
    },
  );
  await director.step(
    "Las oportunidades se trabajan en un tablero, etapa por etapa.",
    async () => {
      await visit("Oportunidades");
    },
  );
  await director.step(
    "Las cotizaciones se redactan, se envían y se responden desde el CRM.",
    async () => {
      await visit("Cotizaciones");
    },
  );
  await director.step(
    "Se cotiza desde un catálogo: productos y listas de precios.",
    async () => {
      await visit("Productos");
      await visit("Listas de precios");
    },
  );

  await director.step(
    "Clientes reúne a las personas y a las empresas con las que se trabaja.",
    async () => {
      await visit("Contactos");
      await visit("Empresas");
    },
  );

  await director.step(
    "Actividades son las tareas: en lista, en tablero o en calendario.",
    async () => {
      await visit("Tareas");
    },
  );

  await director.step(
    "Analítica responde cómo va la venta: paneles, informes a medida y el rendimiento de cada equipo contra su cuota.",
    async () => {
      await visit("Analítica");
      await visit("Informes");
      await visit("Rendimiento de los equipos");
    },
  );

  await director.step(
    "Configuración: los usuarios y sus roles, y los equipos comerciales.",
    async () => {
      await visit("Usuarios");
      await visit("Equipos");
    },
  );
  await director.step(
    "Lo que una cotización necesita: impuestos, monedas y tasas de cambio.",
    async () => {
      await visit("Impuestos");
      await visit("Monedas y tasas");
    },
  );
  await director.step(
    "Lo que el cliente recibe: la presentación de su enlace y el correo.",
    async () => {
      await visit("Portal del cliente");
      await visit("Correo");
    },
  );
  await director.step(
    "Y los ajustes generales, con la importación de datos.",
    async () => {
      await visit("Ajustes");
      await visit("Importar datos");
    },
  );

  await director.step(
    "Ayuda es el manual: tutoriales en video dentro de la aplicación.",
    async () => {
      await visit("Manual");
    },
  );

  await director.step(
    "El menú cambia con el rol: un comercial ve solo sus registros y no ve la configuración; responsables y administradores ven todo.",
    async () => {
      await visit("Panel de control");
    },
  );

  await director.chapter(
    "El proceso principal",
    "Del lead a la cotización aceptada.",
  );
});
