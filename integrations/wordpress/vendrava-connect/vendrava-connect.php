<?php
/**
 * Plugin Name: Vendrava Connect
 * Plugin URI:  https://vendrava.com
 * Description: Conecta esta web con Vendrava: instala el script universal de captación sin tocar el tema y permite editar título SEO y meta description de cada página desde Vendrava.
 * Version:     1.0.0
 * Requires at least: 5.6
 * Requires PHP: 7.4
 * Author:      Vendrava
 * License:     GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: vendrava-connect
 *
 * Qué expone (namespace REST `vendrava/v1`, autenticado con contraseñas de
 * aplicación de WordPress, nunca con un token propio):
 *   GET  /status           estado del plugin y plugin SEO detectado
 *   POST /settings         siteKey, endpoint y URL del script (manage_options)
 *   GET  /seo?ids=1,2      título SEO y meta description de varias entradas
 *   GET  /seo/{id}         idem, una entrada
 *   POST /seo/{id}         escribe título SEO y meta description
 *
 * Los metadatos se guardan donde el plugin SEO activo los lee (Yoast, Rank
 * Math o All in One SEO). Sin plugin SEO, se guardan en claves propias y este
 * plugin los imprime en el <head>.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'VENDRAVA_CONNECT_VERSION', '1.0.0' );
define( 'VENDRAVA_CONNECT_OPTION', 'vendrava_connect_settings' );
define( 'VENDRAVA_CONNECT_NAMESPACE', 'vendrava/v1' );

final class Vendrava_Connect {

	/** @var Vendrava_Connect|null */
	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'wp_head', array( $this, 'print_script' ), 1 );
		add_action( 'wp_head', array( $this, 'print_fallback_description' ), 2 );
		add_filter( 'pre_get_document_title', array( $this, 'filter_document_title' ), 20 );
		add_action( 'admin_menu', array( $this, 'admin_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_notices', array( $this, 'admin_notices' ) );
	}

	/* ── Ajustes ──────────────────────────────────────────────────────── */

	public static function defaults() {
		return array(
			'site_key'   => '',
			'endpoint'   => '',
			'script_url' => '',
			'enabled'    => false,
		);
	}

	public static function settings() {
		$stored = get_option( VENDRAVA_CONNECT_OPTION, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return array_merge( self::defaults(), $stored );
	}

	public static function sanitize_settings( $input ) {
		$input = is_array( $input ) ? $input : array();
		$clean = self::defaults();

		$site_key = isset( $input['site_key'] ) ? trim( (string) $input['site_key'] ) : '';
		$clean['site_key'] = preg_match( '/^wk_[A-Za-z0-9_-]{16,80}$/', $site_key ) ? $site_key : '';

		$endpoint = isset( $input['endpoint'] ) ? esc_url_raw( trim( (string) $input['endpoint'] ) ) : '';
		$clean['endpoint'] = ( $endpoint && preg_match( '#^https?://#i', $endpoint ) ) ? $endpoint : '';

		$script_url = isset( $input['script_url'] ) ? esc_url_raw( trim( (string) $input['script_url'] ) ) : '';
		$clean['script_url'] = ( $script_url && preg_match( '#^https?://#i', $script_url ) ) ? $script_url : '';

		$clean['enabled'] = ! empty( $input['enabled'] ) && filter_var( $input['enabled'], FILTER_VALIDATE_BOOLEAN );
		return $clean;
	}

	private function script_ready( $settings ) {
		return $settings['enabled'] && $settings['site_key'] && $settings['endpoint'] && $settings['script_url'];
	}

	/* ── Front: script universal y SEO de respaldo ────────────────────── */

	public function print_script() {
		$settings = self::settings();
		if ( ! $this->script_ready( $settings ) ) {
			return;
		}
		printf(
			"<script defer src=\"%s\" data-vendrava-site=\"%s\" data-vendrava-endpoint=\"%s\"></script>\n",
			esc_url( $settings['script_url'] ),
			esc_attr( $settings['site_key'] ),
			esc_url( $settings['endpoint'] )
		);
	}

	public static function seo_plugin() {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return 'yoast';
		}
		if ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) ) {
			return 'rankmath';
		}
		if ( defined( 'AIOSEO_VERSION' ) ) {
			return 'aioseo';
		}
		return 'none';
	}

	public function filter_document_title( $title ) {
		if ( 'none' !== self::seo_plugin() || ! is_singular() ) {
			return $title;
		}
		$custom = get_post_meta( get_queried_object_id(), '_vendrava_seo_title', true );
		return $custom ? wp_strip_all_tags( $custom ) : $title;
	}

	public function print_fallback_description() {
		if ( 'none' !== self::seo_plugin() || ! is_singular() ) {
			return;
		}
		$description = get_post_meta( get_queried_object_id(), '_vendrava_seo_description', true );
		if ( $description ) {
			printf( "<meta name=\"description\" content=\"%s\" />\n", esc_attr( wp_strip_all_tags( $description ) ) );
		}
	}

	/* ── Lectura / escritura de metadatos SEO ─────────────────────────── */

	private function seo_keys( $plugin ) {
		switch ( $plugin ) {
			case 'yoast':
				return array( '_yoast_wpseo_title', '_yoast_wpseo_metadesc' );
			case 'rankmath':
				return array( 'rank_math_title', 'rank_math_description' );
			default:
				return array( '_vendrava_seo_title', '_vendrava_seo_description' );
		}
	}

	private function aioseo_table() {
		global $wpdb;
		$table = $wpdb->prefix . 'aioseo_posts';
		$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
		return $found === $table ? $table : null;
	}

	public function read_seo( $post_id ) {
		$plugin = self::seo_plugin();
		if ( 'aioseo' === $plugin ) {
			global $wpdb;
			$table = $this->aioseo_table();
			if ( $table ) {
				$row = $wpdb->get_row( $wpdb->prepare( "SELECT title, description FROM {$table} WHERE post_id = %d", $post_id ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				return array(
					'id'          => (int) $post_id,
					'title'       => $row && '' !== (string) $row['title'] ? (string) $row['title'] : null,
					'description' => $row && '' !== (string) $row['description'] ? (string) $row['description'] : null,
					'source'      => $plugin,
				);
			}
		}
		list( $title_key, $description_key ) = $this->seo_keys( $plugin );
		$title       = get_post_meta( $post_id, $title_key, true );
		$description = get_post_meta( $post_id, $description_key, true );
		return array(
			'id'          => (int) $post_id,
			'title'       => '' !== (string) $title ? (string) $title : null,
			'description' => '' !== (string) $description ? (string) $description : null,
			'source'      => 'none' === $plugin ? 'vendrava' : $plugin,
		);
	}

	public function write_seo( $post_id, $title, $description ) {
		$plugin = self::seo_plugin();
		if ( 'aioseo' === $plugin ) {
			global $wpdb;
			$table = $this->aioseo_table();
			if ( $table ) {
				$exists = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE post_id = %d", $post_id ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$data   = array();
				if ( null !== $title ) {
					$data['title'] = $title;
				}
				if ( null !== $description ) {
					$data['description'] = $description;
				}
				if ( $exists ) {
					$data['updated'] = current_time( 'mysql', true );
					$wpdb->update( $table, $data, array( 'post_id' => $post_id ) );
				} else {
					$data['post_id'] = $post_id;
					$data['created'] = current_time( 'mysql', true );
					$data['updated'] = current_time( 'mysql', true );
					$wpdb->insert( $table, $data );
				}
				return $this->read_seo( $post_id );
			}
		}
		list( $title_key, $description_key ) = $this->seo_keys( $plugin );
		if ( null !== $title ) {
			'' === $title ? delete_post_meta( $post_id, $title_key ) : update_post_meta( $post_id, $title_key, $title );
		}
		if ( null !== $description ) {
			'' === $description ? delete_post_meta( $post_id, $description_key ) : update_post_meta( $post_id, $description_key, $description );
		}
		return $this->read_seo( $post_id );
	}

	/* ── REST ─────────────────────────────────────────────────────────── */

	public function register_routes() {
		register_rest_route( VENDRAVA_CONNECT_NAMESPACE, '/status', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => array( $this, 'rest_status' ),
			'permission_callback' => array( $this, 'can_edit_pages' ),
		) );
		register_rest_route( VENDRAVA_CONNECT_NAMESPACE, '/settings', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => array( $this, 'rest_settings' ),
			'permission_callback' => function () {
				return current_user_can( 'manage_options' );
			},
			'args'                => array(
				'site_key'   => array( 'type' => 'string', 'required' => false ),
				'endpoint'   => array( 'type' => 'string', 'required' => false ),
				'script_url' => array( 'type' => 'string', 'required' => false ),
				'enabled'    => array( 'type' => 'boolean', 'required' => false ),
			),
		) );
		register_rest_route( VENDRAVA_CONNECT_NAMESPACE, '/seo', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => array( $this, 'rest_seo_batch' ),
			'permission_callback' => array( $this, 'can_edit_pages' ),
			'args'                => array(
				'ids' => array( 'type' => 'string', 'required' => true ),
			),
		) );
		register_rest_route( VENDRAVA_CONNECT_NAMESPACE, '/seo/(?P<id>\d+)', array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_seo_get' ),
				'permission_callback' => array( $this, 'can_edit_this_post' ),
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_seo_set' ),
				'permission_callback' => array( $this, 'can_edit_this_post' ),
				'args'                => array(
					'title'       => array( 'type' => array( 'string', 'null' ), 'required' => false ),
					'description' => array( 'type' => array( 'string', 'null' ), 'required' => false ),
				),
			),
		) );
	}

	public function can_edit_pages() {
		return current_user_can( 'edit_pages' ) || current_user_can( 'edit_posts' );
	}

	public function can_edit_this_post( WP_REST_Request $request ) {
		$post_id = (int) $request['id'];
		return $post_id > 0 && current_user_can( 'edit_post', $post_id );
	}

	public function rest_status() {
		$settings = self::settings();
		return rest_ensure_response( array(
			'plugin'          => 'vendrava-connect',
			'version'         => VENDRAVA_CONNECT_VERSION,
			'wp_version'      => get_bloginfo( 'version' ),
			'seo_plugin'      => self::seo_plugin(),
			'site_key_set'    => '' !== $settings['site_key'],
			'script_enabled'  => (bool) $this->script_ready( $settings ),
			'app_passwords'   => function_exists( 'wp_is_application_passwords_available' ) ? wp_is_application_passwords_available() : false,
			'site_url'        => home_url( '/' ),
		) );
	}

	public function rest_settings( WP_REST_Request $request ) {
		$current = self::settings();
		$input   = array_merge( $current, array_intersect_key( $request->get_params(), self::defaults() ) );
		$clean   = self::sanitize_settings( $input );
		if ( isset( $input['site_key'] ) && '' !== $input['site_key'] && '' === $clean['site_key'] ) {
			return new WP_Error( 'vendrava_invalid_site_key', 'siteKey no válido', array( 'status' => 400 ) );
		}
		update_option( VENDRAVA_CONNECT_OPTION, $clean, false );
		return $this->rest_status();
	}

	public function rest_seo_batch( WP_REST_Request $request ) {
		$ids   = array_filter( array_map( 'intval', explode( ',', (string) $request['ids'] ) ) );
		$ids   = array_slice( array_unique( $ids ), 0, 100 );
		$items = array();
		foreach ( $ids as $id ) {
			if ( current_user_can( 'edit_post', $id ) ) {
				$items[] = $this->read_seo( $id );
			}
		}
		return rest_ensure_response( array( 'items' => $items, 'seo_plugin' => self::seo_plugin() ) );
	}

	public function rest_seo_get( WP_REST_Request $request ) {
		return rest_ensure_response( $this->read_seo( (int) $request['id'] ) );
	}

	public function rest_seo_set( WP_REST_Request $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'vendrava_post_not_found', 'La entrada no existe', array( 'status' => 404 ) );
		}
		$params      = $request->get_json_params();
		$params      = is_array( $params ) ? $params : array();
		$title       = array_key_exists( 'title', $params ) ? $this->clean_text( $params['title'], 200 ) : null;
		$description = array_key_exists( 'description', $params ) ? $this->clean_text( $params['description'], 400 ) : null;
		if ( null === $title && null === $description ) {
			return new WP_Error( 'vendrava_nothing_to_update', 'Falta title o description', array( 'status' => 400 ) );
		}
		return rest_ensure_response( $this->write_seo( $post_id, $title, $description ) );
	}

	/** null → sin cambio; '' → borrar; texto → guardar recortado. */
	private function clean_text( $value, $max ) {
		if ( null === $value ) {
			return '';
		}
		$value = wp_strip_all_tags( (string) $value );
		$value = trim( preg_replace( '/\s+/', ' ', $value ) );
		return mb_substr( $value, 0, $max );
	}

	/* ── Admin ────────────────────────────────────────────────────────── */

	public function admin_menu() {
		add_options_page( 'Vendrava Connect', 'Vendrava Connect', 'manage_options', 'vendrava-connect', array( $this, 'render_settings_page' ) );
	}

	public function register_settings() {
		register_setting( 'vendrava_connect', VENDRAVA_CONNECT_OPTION, array(
			'type'              => 'array',
			'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
			'default'           => self::defaults(),
		) );
	}

	public function admin_notices() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'settings_page_vendrava-connect' !== $screen->id ) {
			return;
		}
		if ( function_exists( 'wp_is_application_passwords_available' ) && ! wp_is_application_passwords_available() ) {
			echo '<div class="notice notice-warning"><p><strong>Vendrava Connect:</strong> las contraseñas de aplicación están desactivadas en este sitio (normalmente porque no usa HTTPS). Vendrava las necesita para conectarse.</p></div>';
		}
	}

	public function render_settings_page() {
		$settings = self::settings();
		$status   = $this->script_ready( $settings ) ? 'Script activo en todas las páginas' : 'Script no activo';
		?>
		<div class="wrap">
			<h1>Vendrava Connect</h1>
			<p>Conecta esta web con Vendrava. Lo habitual es no rellenar nada aquí: Vendrava envía estos valores automáticamente al conectar con un usuario y una <a href="<?php echo esc_url( admin_url( 'profile.php#application-passwords-section' ) ); ?>">contraseña de aplicación</a>.</p>
			<table class="widefat striped" style="max-width:720px;margin:12px 0 20px">
				<tbody>
					<tr><th style="width:220px">Estado del script</th><td><?php echo esc_html( $status ); ?></td></tr>
					<tr><th>Plugin SEO detectado</th><td><?php echo esc_html( self::seo_plugin() ); ?></td></tr>
					<tr><th>Versión</th><td><?php echo esc_html( VENDRAVA_CONNECT_VERSION ); ?></td></tr>
				</tbody>
			</table>
			<form method="post" action="options.php">
				<?php settings_fields( 'vendrava_connect' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="vendrava-site-key">Site key</label></th>
						<td><input id="vendrava-site-key" name="<?php echo esc_attr( VENDRAVA_CONNECT_OPTION ); ?>[site_key]" type="text" class="regular-text code" value="<?php echo esc_attr( $settings['site_key'] ); ?>" placeholder="wk_…" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="vendrava-endpoint">Endpoint de eventos</label></th>
						<td><input id="vendrava-endpoint" name="<?php echo esc_attr( VENDRAVA_CONNECT_OPTION ); ?>[endpoint]" type="url" class="regular-text code" value="<?php echo esc_attr( $settings['endpoint'] ); ?>" placeholder="https://api.vendrava.com/api/web-events/collect" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="vendrava-script-url">URL del script</label></th>
						<td><input id="vendrava-script-url" name="<?php echo esc_attr( VENDRAVA_CONNECT_OPTION ); ?>[script_url]" type="url" class="regular-text code" value="<?php echo esc_attr( $settings['script_url'] ); ?>" placeholder="https://api.vendrava.com/web-client.js" /></td>
					</tr>
					<tr>
						<th scope="row">Script activo</th>
						<td><label><input name="<?php echo esc_attr( VENDRAVA_CONNECT_OPTION ); ?>[enabled]" type="checkbox" value="1" <?php checked( $settings['enabled'] ); ?> /> Insertar el script universal de Vendrava en el &lt;head&gt;</label></td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
			<p><em>El script no lee ni envía datos de formularios ni información personal. Solo registra vistas, envíos y clics como señales anónimas asociadas a este dominio.</em></p>
		</div>
		<?php
	}
}

Vendrava_Connect::instance();
