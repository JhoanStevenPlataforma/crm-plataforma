import type { TranslationMessages } from "ra-core";

/**
 * Spanish messages for the react-admin core.
 *
 * English and French come from the `ra-language-*` packages. There is no
 * maintained Spanish equivalent pinned here, and adding a dependency is a
 * supply-chain decision (see `.claude/rules/dependency-safety.md`), so the
 * Spanish catalog lives in the repo. It mirrors `ra-language-english` key for
 * key — keep them in sync when react-admin adds messages.
 */
export const spanishMessages: TranslationMessages = {
  ra: {
    action: {
      add_filter: "Añadir filtro",
      add: "Añadir",
      back: "Volver",
      bulk_actions:
        "1 elemento seleccionado |||| %{smart_count} elementos seleccionados",
      cancel: "Cancelar",
      clear_array_input: "Vaciar la lista",
      clear_input_value: "Borrar el valor",
      clone: "Duplicar",
      confirm: "Confirmar",
      create: "Crear",
      create_item: "Crear %{item}",
      delete: "Eliminar",
      edit: "Editar",
      export: "Exportar",
      list: "Lista",
      refresh: "Actualizar",
      remove_filter: "Quitar este filtro",
      remove_all_filters: "Quitar todos los filtros",
      remove: "Quitar",
      reset: "Restablecer",
      save: "Guardar",
      search: "Buscar",
      search_columns: "Buscar columnas",
      select_all: "Seleccionar todo",
      select_all_button: "Seleccionar todo",
      select_row: "Seleccionar esta fila",
      show: "Ver",
      sort: "Ordenar",
      undo: "Deshacer",
      unselect: "Deseleccionar",
      expand: "Desplegar",
      close: "Cerrar",
      open_menu: "Abrir el menú",
      close_menu: "Cerrar el menú",
      update: "Actualizar",
      move_up: "Subir",
      move_down: "Bajar",
      open: "Abrir",
      toggle_theme: "Cambiar entre modo claro y oscuro",
      select_columns: "Columnas",
      update_application: "Recargar la aplicación",
    },
    boolean: {
      true: "Sí",
      false: "No",
      null: " ",
    },
    page: {
      create: "Crear %{name}",
      dashboard: "Panel de control",
      edit: "%{name} %{recordRepresentation}",
      error: "Algo ha salido mal",
      list: "%{name}",
      loading: "Cargando",
      not_found: "No encontrado",
      show: "%{name} %{recordRepresentation}",
      empty: "Todavía no hay %{name}.",
      invite: "¿Quieres añadir uno?",
      access_denied: "Acceso denegado",
      authentication_error: "Error de autenticación",
    },
    input: {
      file: {
        upload_several:
          "Arrastra algunos archivos para subirlos, o haz clic para seleccionar uno.",
        upload_single:
          "Arrastra un archivo para subirlo, o haz clic para seleccionarlo.",
      },
      image: {
        upload_several:
          "Arrastra algunas imágenes para subirlas, o haz clic para seleccionar una.",
        upload_single:
          "Arrastra una imagen para subirla, o haz clic para seleccionarla.",
      },
      references: {
        all_missing: "No se han encontrado los datos de las referencias.",
        many_missing:
          "Al menos una de las referencias asociadas ya no está disponible.",
        single_missing: "La referencia asociada ya no está disponible.",
      },
      password: {
        toggle_visible: "Ocultar la contraseña",
        toggle_hidden: "Mostrar la contraseña",
      },
    },
    message: {
      about: "Acerca de",
      access_denied: "No tienes permiso para acceder a esta página",
      are_you_sure: "¿Estás seguro?",
      authentication_error:
        "El servidor de autenticación ha devuelto un error y no se han podido comprobar tus credenciales.",
      auth_error:
        "Se ha producido un error al validar el token de autenticación.",
      bulk_delete_content:
        "¿Seguro que quieres eliminar este %{name}? |||| ¿Seguro que quieres eliminar estos %{smart_count} elementos?",
      bulk_delete_title:
        "Eliminar %{name} |||| Eliminar %{smart_count} %{name}",
      bulk_update_content:
        "¿Seguro que quieres actualizar %{name} %{recordRepresentation}? |||| ¿Seguro que quieres actualizar estos %{smart_count} elementos?",
      bulk_update_title:
        "Actualizar %{name} %{recordRepresentation} |||| Actualizar %{smart_count} %{name}",
      clear_array_input: "¿Seguro que quieres vaciar toda la lista?",
      delete_content: "¿Seguro que quieres eliminar este %{name}?",
      delete_title: "Eliminar %{name} %{recordRepresentation}",
      details: "Detalles",
      error:
        "Se ha producido un error en el cliente y no se ha podido completar tu petición.",
      invalid_form: "El formulario no es válido. Revisa los errores",
      loading: "Espera un momento",
      no: "No",
      not_found:
        "Has escrito una URL incorrecta o has seguido un enlace erróneo.",
      select_all_limit_reached:
        "Hay demasiados elementos para seleccionarlos todos. Solo se han seleccionado los primeros %{max}.",
      unsaved_changes:
        "Algunos de tus cambios no se han guardado. ¿Seguro que quieres descartarlos?",
      yes: "Sí",
      placeholder_data_warning:
        "Problema de red: no se han podido actualizar los datos.",
    },
    navigation: {
      clear_filters: "Quitar los filtros",
      no_filtered_results:
        "No se ha encontrado ningún %{name} con los filtros actuales.",
      no_results: "No se ha encontrado ningún %{name}",
      no_more_results:
        "La página %{page} está fuera de rango. Prueba con la página anterior.",
      page_out_of_boundaries: "La página %{page} está fuera de rango",
      page_out_from_end: "No se puede ir más allá de la última página",
      page_out_from_begin: "No se puede ir antes de la página 1",
      page_range_info: "%{offsetBegin}-%{offsetEnd} de %{total}",
      partial_page_range_info:
        "%{offsetBegin}-%{offsetEnd} de más de %{offsetEnd}",
      current_page: "Página %{page}",
      page: "Ir a la página %{page}",
      first: "Ir a la primera página",
      last: "Ir a la última página",
      next: "Ir a la página siguiente",
      previous: "Ir a la página anterior",
      page_rows_per_page: "Filas por página:",
      skip_nav: "Ir al contenido",
    },
    sort: {
      sort_by: "Ordenar por %{field_lower_first} %{order}",
      ASC: "de forma ascendente",
      DESC: "de forma descendente",
    },
    auth: {
      auth_check_error: "Inicia sesión para continuar",
      user_menu: "Perfil",
      username: "Usuario",
      password: "Contraseña",
      email: "Correo electrónico",
      sign_in: "Iniciar sesión",
      sign_in_error: "Error de autenticación, inténtalo de nuevo",
      logout: "Cerrar sesión",
    },
    notification: {
      updated:
        "Elemento actualizado |||| %{smart_count} elementos actualizados",
      created: "Elemento creado",
      deleted: "Elemento eliminado |||| %{smart_count} elementos eliminados",
      bad_item: "Elemento incorrecto",
      item_doesnt_exist: "El elemento no existe",
      http_error: "Error de comunicación con el servidor",
      data_provider_error:
        "Error del dataProvider. Consulta la consola para más detalles.",
      i18n_error:
        "No se han podido cargar las traducciones del idioma indicado",
      canceled: "Acción cancelada",
      logged_out: "Tu sesión ha terminado, vuelve a conectarte.",
      not_authorized: "No tienes autorización para acceder a este recurso.",
      application_update_available: "Hay una nueva versión disponible.",
      offline: "Sin conexión. No se han podido obtener los datos.",
    },
    validation: {
      required: "Obligatorio",
      minLength: "Debe tener al menos %{min} caracteres",
      maxLength: "Debe tener %{max} caracteres como máximo",
      minValue: "Debe ser como mínimo %{min}",
      maxValue: "Debe ser %{max} o menos",
      number: "Debe ser un número",
      email: "Debe ser un correo electrónico válido",
      oneOf: "Debe ser uno de estos valores: %{options}",
      regex: "Debe seguir un formato concreto (regexp): %{pattern}",
      unique: "Debe ser único",
    },
    saved_queries: {
      label: "Búsquedas guardadas",
      query_name: "Nombre de la búsqueda",
      new_label: "Guardar la búsqueda actual...",
      new_dialog_title: "Guardar la búsqueda actual como",
      remove_label: "Eliminar la búsqueda guardada",
      remove_label_with_name: 'Eliminar la búsqueda "%{name}"',
      remove_dialog_title: "¿Eliminar la búsqueda guardada?",
      remove_message:
        "¿Seguro que quieres eliminar ese elemento de tu lista de búsquedas guardadas?",
      help: "Filtra la lista y guarda esta búsqueda para más adelante",
    },
    guesser: {
      empty: {
        title: "No hay datos que mostrar",
        message: "Revisa tu proveedor de datos",
      },
    },
    configurable: {
      customize: "Personalizar",
      configureMode: "Configurar esta página",
      inspector: {
        title: "Inspector",
        content:
          "Pasa el cursor por los elementos de la interfaz para configurarlos",
        reset: "Restablecer los ajustes",
        hideAll: "Ocultar todo",
        showAll: "Mostrar todo",
      },
      Datagrid: {
        title: "Tabla de datos",
        unlabeled: "Columna sin título n.º %{column}",
      },
      SimpleForm: {
        title: "Formulario",
        unlabeled: "Campo sin título n.º %{input}",
      },
      SimpleList: {
        title: "Lista",
        primaryText: "Texto principal",
        secondaryText: "Texto secundario",
        tertiaryText: "Texto terciario",
      },
    },
  },
};

export default spanishMessages;
