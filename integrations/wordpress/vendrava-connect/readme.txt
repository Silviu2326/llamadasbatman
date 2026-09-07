=== Vendrava Connect ===
Contributors: vendrava
Tags: vendrava, analytics, seo, leads
Requires at least: 5.6
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Conecta tu web WordPress con Vendrava: script universal de captación sin tocar el tema y edición de título SEO y meta description desde Vendrava.

== Description ==

Vendrava Connect añade dos cosas a WordPress:

* Inserta el script universal de Vendrava en el `<head>` de todas las páginas. El script registra vistas, envíos de formulario y clics como señales anónimas. No lee ni envía valores de formularios ni datos personales.
* Expone una pequeña API REST (`vendrava/v1`) para que Vendrava lea y escriba el título SEO y la meta description de cada página. Los metadatos se guardan donde los lee tu plugin SEO (Yoast SEO, Rank Math o All in One SEO). Sin plugin SEO, este plugin los imprime él mismo.

La autenticación usa las contraseñas de aplicación nativas de WordPress. El plugin no crea tokens propios ni usuarios.

== Installation ==

1. Comprime la carpeta `vendrava-connect` en un `.zip` y súbelo en Plugins → Añadir nuevo → Subir plugin. O copia la carpeta en `wp-content/plugins/`.
2. Activa el plugin.
3. En WordPress, ve a Usuarios → Perfil → Contraseñas de aplicación y crea una llamada "Vendrava". Copia la contraseña.
4. En Vendrava, abre Conexiones → Web, añade el dominio y en el bloque "Conector WordPress" introduce tu usuario y esa contraseña.
5. Vendrava instalará el script y verificará la conexión automáticamente.

== Frequently Asked Questions ==

= ¿Necesito HTTPS? =

Sí. WordPress desactiva las contraseñas de aplicación en sitios sin HTTPS.

= ¿Qué puede cambiar Vendrava en mi web? =

Título, contenido y extracto de páginas y entradas (por la API nativa de WordPress, con los permisos del usuario que conectaste), y título SEO y meta description (por este plugin). Cada cambio queda registrado en Vendrava.

== Changelog ==

= 1.0.0 =
* Primera versión: script universal, estado, ajustes y metadatos SEO por REST.
