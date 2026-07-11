# Meta Ads API — qué se puede hacer

Investigación de las APIs de anuncios de Meta (Facebook/Instagram), pensando en un posible uso desde SilxarCRM: traer leads de Facebook Lead Ads para llamarlos automáticamente con VozIA.

## Las 4 APIs relacionadas con anuncios

| API | Para qué sirve |
|---|---|
| **Marketing API** | Crear/editarana/pausar campañas, ad sets y anuncios; leer métricas (Insights); gestionar audiencias. Es la principal. |
| **Conversions API (CAPI)** | Enviar eventos de conversión (compra, lead, llamada realizada) desde tu servidor/CRM a Meta, para mejorar la optimización de los anuncios. |
| **Ad Library API** | Acceso público a anuncios activos de cualquier anunciante (transparencia/investigación de competencia). No requiere ser dueño de la cuenta. |
| **Business Management API** | Gestión de Business Manager: cuentas publicitarias, usuarios, permisos, Páginas. |

Todo corre sobre **Graph API** (HTTP + JSON), con `access_token` de una app de Meta for Developers.

## 1. Marketing API — gestión de campañas

Jerarquía: **Campaign → Ad Set → Ad → Ad Creative**.

- Crear/editar/pausar/borrar campañas, ad sets y anuncios por API (lo mismo que hace Ads Manager).
- Definir objetivo de campaña (leads, tráfico, mensajes, conversiones, ventas del catálogo, etc.).
- Configurar presupuesto, puja, calendario, ubicaciones (Facebook/Instagram/Messenger/Audience Network).
- Crear el creative (imagen/video/carrusel, texto, CTA) referenciando un post existente de la Página (mantiene likes/comentarios) o subiendo uno nuevo.
- Segmentación (targeting): edad, ubicación, intereses, comportamientos, Custom Audiences, Lookalike Audiences, Advantage+ Audience (targeting automático con IA).
- **Advantage+**: desde v25.0 (feb 2025) ya no se pueden crear/editar campañas Advantage+ Shopping ni Advantage+ App por API (solo desde Ads Manager); el resto de tipos de campaña sí.

## 2. Insights API — reporting

Edge de cualquier objeto de anuncio (`/insights`) para pedir métricas.

- 70+ métricas: impressions, reach, frequency, clicks, ctr, spend, cpm, cpc, actions (conversiones), action_values, etc.
- **Breakdowns**: por edad, género, ubicación, dispositivo, plataforma, hora del día, etc. (combinaciones limitadas).
- Rango de fechas, ventana de atribución configurable.
- Reporting asíncrono para reportes grandes (se pide un job y se consulta el resultado).

## 3. Lead Ads — lo más relevante para VozIA/CRM

Los anuncios "Lead Ads" generan un formulario nativo dentro de Facebook/Instagram. Los leads se pueden traer de dos formas:

- **Webhooks (tiempo real, recomendado)**: te suscribís al campo `leadgen` de la Página. Cada vez que alguien completa el formulario, Meta manda un POST a tu endpoint con el `leadgen_id`; con ese ID pedís los datos completos del lead a la Graph API (`GET /{leadgen_id}`).
- **Bulk read**: pedir leads históricos por API sin webhook (para lotes, no para tiempo real).
- **CRM data sharing**: se puede devolver a Meta info de calidad del lead (ej. "se convirtió en cliente") para que optimice futuras campañas hacia leads similares.

Esto encaja directo con el flujo de llamadasrobin: webhook de lead → guardar en CRM → disparar llamada de VozIA automáticamente.

## 4. Audiencias

- **Custom Audiences**: subir tu propia lista (CRM, visitantes de la web, usuarios de la app) para targetear o excluir. Mínimo 1,000 personas para poder anunciar.
- **Lookalike Audiences**: Meta busca gente parecida a una Custom Audience "semilla" (mínimo 100 personas en la semilla). % configurable (1% más preciso, hasta 10% más amplio).
- **Advantage+ Audience**: solo ubicación y edad mínima son restricciones duras; el resto (intereses, audiencias) son sugerencias que el algoritmo puede expandir.

## 5. Conversions API (CAPI)

- Mandás eventos server-side (no depende del pixel del navegador): `Lead`, `Purchase`, `Schedule`, evento custom ("llamada contestada", "cita agendada"), etc.
- Sirve para recuperar señal perdida por bloqueadores de cookies/iOS y para pasarle a Meta conversiones que pasan fuera del sitio (ej. una venta cerrada por teléfono).

## 6. Catalog / Commerce API

- Subir y mantener actualizado un catálogo de productos (precio, stock, imágenes) para anuncios dinámicos y Shops/Marketplace.

## 7. Business Management API

- Administrar Business Manager: cuentas publicitarias, Páginas, usuarios y sus permisos, asignación de assets entre negocios.

## 8. Automated Rules

- Reglas dentro de Ads Manager/API que pausan, ajustan presupuesto o notifican automáticamente según condiciones (ej. "pausar si CPA > X").

## 9. Ad Library API

- Búsqueda pública de anuncios activos de cualquier página (útil para research de competencia), sin necesitar acceso a su cuenta. No expone métricas privadas (CTR, conversión exacta); spend/impressions se dan en rangos.

## Requisitos técnicos básicos

- App registrada en developers.facebook.com + revisión de permisos (`ads_management`, `leads_retrieval`, `pages_manage_ads`, etc.).
- Access token de sistema (System User) para uso server-to-server sin expirar cada 60 días.
- Versión de API vigente (se deprecan versiones viejas ~2 años después de release).

## Fuentes

- [Marketing API — Meta for Developers](https://developers.facebook.com/docs/marketing-api/)
- [Conversions API — Meta for Developers](https://developers.facebook.com/documentation/ads-commerce/conversions-api)
- [Lead Ads guide](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads)
- [Retrieving Leads](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving)
- [Webhooks for Lead Ads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/)
- [Insights API](https://developers.facebook.com/docs/marketing-api/insights/)
- [Insights Breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/)
- [Advantage Lookalike](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-expansion/advantage-lookalike)
- [Product Catalog reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog)
