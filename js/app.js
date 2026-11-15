/* ============================================================
   INTERCAMBIO DE REGALOS
   ------------------------------------------------------------
   Aplicación estática preparada para GitHub Pages.

   MODO DE VISTA PREVIA
   Si API_URL está vacío, los deseos se guardan en localStorage.
   Esto permite revisar la aplicación sin configurar un servidor,
   pero cada navegador tendrá su propia lista independiente.

   MODO COMPARTIDO
   Para publicar una lista común, asigna a API_URL la dirección
   /exec de una Web App de Google Apps Script:
     - GET  -> arreglo de filas; la primera contiene encabezados.
     - POST -> recibe { idLista, nombre, regalos, fechaRegistro }.

   La hoja guarda una fila por regalo. Todas las opciones enviadas
   por una persona comparten el mismo idLista y se agrupan al mostrar.

   El POST se envía como texto plano para evitar una solicitud
   preflight de CORS. Apps Script puede leerlo desde
   e.postData.contents y convertirlo con JSON.parse.
   ============================================================ */

(function () {
  "use strict";

  // Agrega aquí la URL /exec de Google Apps Script antes de publicar.
  const API_URL = "https://script.google.com/macros/s/AKfycbypJmPnP8Fx9w2UYtSxbqWyQBGj0XYW1DBXw4HsnyZRMVHMVsmTsIvSHMelU01J9k_w6w/exec";
  // Se conserva esta clave para no perder deseos guardados durante la primera vista previa.
  const CLAVE_ALMACENAMIENTO = "AKfycbypJmPnP8Fx9w2UYtSxbqWyQBGj0XYW1DBXw4HsnyZRMVHMVsmTsIvSHMelU01J9k_w6w";

  let deseos = [];
  let tablaDatos = null;
  let modalDeseo = null;

  const ETIQUETAS_TABLA = {
    placeholder: "Buscar persona o regalo…",
    searchTitle: "Buscar en la lista",
    perPage: "Por página",
    noRows: "No hay personas para mostrar",
    info: "Mostrando {start} a {end} de {rows} personas",
    noResults: "Ninguna persona o regalo coincide con tu búsqueda"
  };

  function texto(valor) {
    return valor == null ? "" : String(valor).trim();
  }

  function limitar(textoEntrada, maximo) {
    return texto(textoEntrada).slice(0, maximo);
  }

  function escaparHtml(valor) {
    const div = document.createElement("div");
    div.textContent = valor == null ? "" : String(valor);
    return div.innerHTML;
  }

  function esUrlWebSegura(valor) {
    if (!valor) return true;

    try {
      const url = new URL(valor);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function idAnterior(nombre) {
    return "anterior-" + texto(nombre).toLocaleLowerCase("es").replace(/\s+/g, "-");
  }

  function normalizarRegistro(registro, idEnPrimeraColumna) {
    if (Array.isArray(registro)) {
      const desplazamiento = idEnPrimeraColumna ? 1 : 0;
      const nombre = limitar(registro[desplazamiento], 80);

      return {
        idLista: idEnPrimeraColumna
          ? limitar(registro[0], 100)
          : idAnterior(nombre),
        nombre: nombre,
        regalo: limitar(registro[desplazamiento + 1], 120),
        detalles: limitar(registro[desplazamiento + 2], 280),
        enlace: limitar(registro[desplazamiento + 3], 500),
        fechaRegistro: texto(registro[desplazamiento + 4])
      };
    }

    const nombre = limitar(registro && registro.nombre, 80);
    return {
      idLista: limitar(registro && registro.idLista, 100) || idAnterior(nombre),
      nombre: nombre,
      regalo: limitar(registro && registro.regalo, 120),
      detalles: limitar(registro && registro.detalles, 280),
      enlace: limitar(registro && registro.enlace, 500),
      fechaRegistro: texto(registro && registro.fechaRegistro)
    };
  }

  function registroValido(registro) {
    return Boolean(
      registro.idLista &&
      registro.nombre &&
      registro.regalo &&
      esUrlWebSegura(registro.enlace)
    );
  }

  function leerAlmacenamientoLocal() {
    try {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_ALMACENAMIENTO) || "[]");
      if (!Array.isArray(guardados)) return [];
      return guardados.map(function (registro) {
        return normalizarRegistro(registro, false);
      }).filter(registroValido);
    } catch (error) {
      return [];
    }
  }

  function guardarEnAlmacenamientoLocal(nuevaLista) {
    const guardados = leerAlmacenamientoLocal();
    const filasNuevas = nuevaLista.regalos.map(function (regalo) {
      return {
        idLista: nuevaLista.idLista,
        nombre: nuevaLista.nombre,
        regalo: regalo.regalo,
        detalles: regalo.detalles,
        enlace: regalo.enlace,
        fechaRegistro: nuevaLista.fechaRegistro
      };
    });

    guardados.push.apply(guardados, filasNuevas);
    localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(guardados));
  }

  async function cargarDeseos() {
    if (!API_URL) {
      deseos = leerAlmacenamientoLocal();
      return;
    }

    const respuesta = await fetch(API_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!respuesta.ok) {
      throw new Error("No se pudo leer la lista (HTTP " + respuesta.status + ").");
    }

    const resultado = await respuesta.json();
    if (resultado && resultado.status === "error") {
      throw new Error(resultado.mensaje || "El servidor reportó un error.");
    }

    const filas = Array.isArray(resultado)
      ? resultado
      : resultado && Array.isArray(resultado.data)
        ? resultado.data
        : [];

    if (filas.length > 0 && Array.isArray(filas[0])) {
      const encabezados = filas[0].map(function (encabezado) {
        return texto(encabezado).toLocaleLowerCase("es");
      });
      const idEnPrimeraColumna = encabezados[0].includes("id");

      deseos = filas
        .slice(1)
        .map(function (fila) {
          return normalizarRegistro(fila, idEnPrimeraColumna);
        })
        .filter(registroValido);
      return;
    }

    deseos = filas.map(function (fila) {
      return normalizarRegistro(fila, false);
    }).filter(registroValido);
  }

  async function enviarDeseo(nuevaLista) {
    if (!API_URL) {
      guardarEnAlmacenamientoLocal(nuevaLista);
      return { status: "success" };
    }

    const respuesta = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        idLista: nuevaLista.idLista,
        nombre: nuevaLista.nombre,
        regalos: nuevaLista.regalos,
        fechaRegistro: nuevaLista.fechaRegistro
      })
    });

    if (!respuesta.ok) {
      throw new Error("Error de red (HTTP " + respuesta.status + ").");
    }

    const resultado = await respuesta.json();
    if (resultado && resultado.status === "error") {
      throw new Error(resultado.mensaje || "El servidor reportó un error.");
    }

    return resultado;
  }

  function destruirTabla() {
    if (tablaDatos) {
      tablaDatos.destroy();
      tablaDatos = null;
    }
  }

  function crearCelda(textoCelda, clase) {
    const celda = document.createElement("td");
    celda.textContent = textoCelda;
    if (clase) celda.className = clase;
    return celda;
  }

  function crearCeldaEnlace(enlace) {
    const celda = document.createElement("td");

    if (!enlace || !esUrlWebSegura(enlace)) {
      celda.textContent = "—";
      celda.className = "text-muted";
      return celda;
    }

    const vinculo = document.createElement("a");
    vinculo.href = enlace;
    vinculo.target = "_blank";
    vinculo.rel = "noopener noreferrer";
    vinculo.className = "enlace-regalo";
    vinculo.setAttribute("aria-label", "Abrir referencia del regalo en una pestaña nueva");

    const icono = document.createElement("i");
    icono.className = "bi bi-box-arrow-up-right";
    icono.setAttribute("aria-hidden", "true");

    vinculo.append(icono, document.createTextNode(" Ver opción"));
    celda.appendChild(vinculo);
    return celda;
  }

  function agruparDeseosPorPersona() {
    const personas = new Map();

    deseos.forEach(function (deseo) {
      const clave = deseo.idLista || idAnterior(deseo.nombre);

      if (!personas.has(clave)) {
        personas.set(clave, {
          idLista: clave,
          nombre: deseo.nombre,
          regalos: []
        });
      }

      personas.get(clave).regalos.push({
        regalo: deseo.regalo,
        detalles: deseo.detalles,
        enlace: deseo.enlace
      });
    });

    return Array.from(personas.values());
  }

  function actualizarTotal(totalPersonas) {
    document.getElementById("totalDeseos").textContent = String(totalPersonas);
  }

  function crearSubtablaRegalos(regalos) {
    const contenedor = document.createElement("div");
    contenedor.className = "subtabla-contenedor";

    const tabla = document.createElement("table");
    tabla.className = "table subtabla-regalos mb-0";

    const encabezado = document.createElement("thead");
    const filaEncabezado = document.createElement("tr");
    ["Regalo", "Detalles", "Referencia"].forEach(function (titulo) {
      const celda = document.createElement("th");
      celda.scope = "col";
      celda.textContent = titulo;
      filaEncabezado.appendChild(celda);
    });
    encabezado.appendChild(filaEncabezado);

    const cuerpo = document.createElement("tbody");
    regalos.forEach(function (regalo) {
      const fila = document.createElement("tr");
      fila.appendChild(crearCelda(regalo.regalo, "regalo-deseo"));
      fila.appendChild(crearCelda(regalo.detalles || "—", "regalo-detalle"));
      fila.appendChild(crearCeldaEnlace(regalo.enlace));
      cuerpo.appendChild(fila);
    });

    tabla.append(encabezado, cuerpo);
    contenedor.appendChild(tabla);
    return contenedor;
  }

  function crearFilaPersona(persona, indice) {
    const fila = document.createElement("tr");
    const celda = document.createElement("td");
    const idCollapse = "regalos-persona-" + indice;

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "persona-desplegable collapsed";
    boton.setAttribute("data-bs-toggle", "collapse");
    boton.setAttribute("data-bs-target", "#" + idCollapse);
    boton.setAttribute("aria-expanded", "false");
    boton.setAttribute("aria-controls", idCollapse);

    const identidad = document.createElement("span");
    identidad.className = "persona-desplegable__identidad";
    const iconoPersona = document.createElement("i");
    iconoPersona.className = "bi bi-person-heart";
    iconoPersona.setAttribute("aria-hidden", "true");
    const nombre = document.createElement("strong");
    nombre.textContent = persona.nombre;
    identidad.append(iconoPersona, nombre);

    const resumen = document.createElement("span");
    resumen.className = "persona-desplegable__resumen";
    const cantidad = document.createElement("span");
    cantidad.className = "badge-regalos";
    cantidad.textContent =
      persona.regalos.length + (persona.regalos.length === 1 ? " regalo" : " regalos");
    const flecha = document.createElement("i");
    flecha.className = "bi bi-chevron-down persona-desplegable__flecha";
    flecha.setAttribute("aria-hidden", "true");
    resumen.append(cantidad, flecha);

    boton.append(identidad, resumen);

    const collapse = document.createElement("div");
    collapse.className = "collapse";
    collapse.id = idCollapse;
    collapse.appendChild(crearSubtablaRegalos(persona.regalos));

    celda.append(boton, collapse);
    fila.appendChild(celda);
    return fila;
  }

  function renderTabla() {
    const cuerpo = document.getElementById("cuerpoTabla");
    const estadoVacio = document.getElementById("estadoVacio");
    const personas = agruparDeseosPorPersona();

    destruirTabla();
    cuerpo.replaceChildren();
    actualizarTotal(personas.length);

    if (personas.length === 0) {
      estadoVacio.classList.remove("d-none");
      return;
    }

    estadoVacio.classList.add("d-none");

    personas.forEach(function (persona, indice) {
      cuerpo.appendChild(crearFilaPersona(persona, indice));
    });

    tablaDatos = new simpleDatatables.DataTable("#tablaRegalos", {
      searchable: true,
      sortable: true,
      perPage: 10,
      perPageSelect: [5, 10, 25, 50],
      labels: ETIQUETAS_TABLA
    });
  }

  function renderCargando() {
    destruirTabla();
    document.getElementById("estadoVacio").classList.add("d-none");
    document.getElementById("cuerpoTabla").innerHTML =
      '<tr><td class="estado-tabla">' +
      '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>' +
      "Cargando listas…</td></tr>";
  }

  function renderError(mensaje) {
    destruirTabla();
    document.getElementById("estadoVacio").classList.add("d-none");

    const cuerpo = document.getElementById("cuerpoTabla");
    const fila = document.createElement("tr");
    const celda = crearCelda(mensaje, "estado-tabla text-danger");
    celda.colSpan = 1;
    fila.appendChild(celda);
    cuerpo.replaceChildren(fila);
  }

  async function refrescarDatos() {
    renderCargando();

    try {
      await cargarDeseos();
      renderTabla();
      return true;
    } catch (error) {
      renderError("No se pudo cargar la lista. Revisa tu conexión e intenta de nuevo.");
      Swal.fire({
        title: "No pudimos cargar los deseos",
        text: error.message,
        icon: "error",
        confirmButtonText: "Entendido",
        confirmButtonColor: "#8f1d2c"
      });
      return false;
    }
  }

  function fechaRegistroActual() {
    return new Date().toISOString();
  }

  function generarIdLista() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return "lista-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function actualizarBotonesEliminar() {
    const bloques = document.querySelectorAll(".regalo-form-item");
    bloques.forEach(function (bloque) {
      bloque.querySelector(".btn-eliminar-regalo").classList.toggle("d-none", bloques.length === 1);
    });
  }

  function actualizarNumerosRegalos() {
    document.querySelectorAll(".regalo-form-item").forEach(function (bloque, indice) {
      bloque.querySelector(".numero-regalo").textContent = String(indice + 1);
    });
  }

  function crearBloqueRegalo() {
    const indice = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const bloque = document.createElement("section");
    bloque.className = "regalo-form-item";
    bloque.innerHTML =
      '<div class="regalo-form-item__encabezado">' +
      '<h4><i class="bi bi-gift me-2" aria-hidden="true"></i>Regalo <span class="numero-regalo"></span></h4>' +
      '<button type="button" class="btn btn-sm btn-eliminar-regalo" aria-label="Quitar este regalo">' +
      '<i class="bi bi-trash3" aria-hidden="true"></i><span>Quitar</span></button></div>' +
      '<div class="row g-3">' +
      '<div class="col-12"><label for="regalo-' + indice + '" class="form-label">¿Qué te gustaría recibir?</label>' +
      '<input type="text" class="form-control campo-regalo" id="regalo-' + indice + '" maxlength="120" ' +
      'placeholder="Ej. Un libro de cocina mexicana" required />' +
      '<div class="invalid-feedback">Escribe el regalo que te gustaría recibir.</div></div>' +
      '<div class="col-12"><label for="detalles-' + indice + '" class="form-label">' +
      'Detalles que pueden ayudar <span class="opcional">(opcional)</span></label>' +
      '<textarea class="form-control campo-detalles" id="detalles-' + indice + '" rows="2" maxlength="280" ' +
      'placeholder="Color, talla, modelo, autor o alguna alternativa…"></textarea>' +
      '<div class="form-text text-end"><span class="contador-detalles">0</span>/280</div></div>' +
      '<div class="col-12"><label for="enlace-' + indice + '" class="form-label">' +
      'Enlace de referencia <span class="opcional">(opcional)</span></label>' +
      '<div class="input-group has-validation"><span class="input-group-text">' +
      '<i class="bi bi-link-45deg" aria-hidden="true"></i></span>' +
      '<input type="url" class="form-control campo-enlace" id="enlace-' + indice + '" maxlength="500" ' +
      'inputmode="url" placeholder="https://ejemplo.com/regalo" />' +
      '<div class="invalid-feedback">Escribe una dirección web válida que comience con http:// o https://.</div>' +
      "</div></div></div>";

    const campoDetalles = bloque.querySelector(".campo-detalles");
    const contador = bloque.querySelector(".contador-detalles");
    const campoEnlace = bloque.querySelector(".campo-enlace");

    campoDetalles.addEventListener("input", function () {
      contador.textContent = String(campoDetalles.value.length);
    });

    campoEnlace.addEventListener("input", function () {
      const valor = campoEnlace.value.trim();
      campoEnlace.setCustomValidity(
        valor && !esUrlWebSegura(valor) ? "Escribe una dirección http o https válida." : ""
      );
    });

    bloque.querySelector(".btn-eliminar-regalo").addEventListener("click", function () {
      bloque.remove();
      actualizarNumerosRegalos();
      actualizarBotonesEliminar();
    });

    return bloque;
  }

  function agregarBloqueRegalo(enfocar) {
    const lista = document.getElementById("listaRegalosFormulario");
    const bloque = crearBloqueRegalo();
    lista.appendChild(bloque);
    actualizarNumerosRegalos();
    actualizarBotonesEliminar();

    if (enfocar) {
      bloque.querySelector(".campo-regalo").focus();
      bloque.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function limpiarFormulario(formulario) {
    formulario.reset();
    formulario.classList.remove("was-validated");
    document.getElementById("listaRegalosFormulario").replaceChildren();
    agregarBloqueRegalo(false);
  }

  function obtenerRegalosFormulario() {
    return Array.from(document.querySelectorAll(".regalo-form-item")).map(function (bloque) {
      const campoRegalo = bloque.querySelector(".campo-regalo");
      const campoDetalles = bloque.querySelector(".campo-detalles");
      const campoEnlace = bloque.querySelector(".campo-enlace");

      campoRegalo.value = campoRegalo.value.trim();
      campoDetalles.value = campoDetalles.value.trim();
      campoEnlace.value = campoEnlace.value.trim();
      campoEnlace.dispatchEvent(new Event("input"));

      return {
        regalo: limitar(campoRegalo.value, 120),
        detalles: limitar(campoDetalles.value, 280),
        enlace: limitar(campoEnlace.value, 500)
      };
    });
  }

  function resumenConfirmacion(nuevaLista) {
    const regalosHtml = nuevaLista.regalos
      .map(function (regalo, indice) {
        const detalles = regalo.detalles || "Sin detalles adicionales";
        const enlace = regalo.enlace || "Sin enlace de referencia";

        return (
          '<li class="resumen-confirmacion__regalo">' +
          "<strong>Regalo " + (indice + 1) + ": " + escaparHtml(regalo.regalo) + "</strong>" +
          "<span>Detalles: " + escaparHtml(detalles) + "</span>" +
          "<span>Referencia: " + escaparHtml(enlace) + "</span>" +
          "</li>"
        );
      })
      .join("");

    return (
      '<div class="resumen-confirmacion">' +
      "<p><strong>Nombre</strong><span class=\"resumen-confirmacion__valor\">" +
      escaparHtml(nuevaLista.nombre) +
      "</span></p>" +
      '<ol class="resumen-confirmacion__lista">' + regalosHtml + "</ol>" +
      '<p class="resumen-confirmacion__aviso"><strong>Esta información no podrá editarse después.</strong></p>' +
      "</div>"
    );
  }

  function configurarFormulario() {
    const elementoModal = document.getElementById("modalDeseo");
    const formulario = document.getElementById("formDeseo");
    const campoNombre = document.getElementById("campoNombre");

    modalDeseo = new bootstrap.Modal(elementoModal);
    agregarBloqueRegalo(false);

    function abrirModal() {
      limpiarFormulario(formulario);
      modalDeseo.show();
    }

    document.getElementById("btnAgregarDeseo").addEventListener("click", abrirModal);
    document.getElementById("btnAgregarVacio").addEventListener("click", abrirModal);
    document.getElementById("btnAgregarOtroRegalo").addEventListener("click", function () {
      agregarBloqueRegalo(true);
    });

    elementoModal.addEventListener("shown.bs.modal", function () {
      campoNombre.focus();
    });

    // En móvil, Bootstrap puede interceptar touchmove y bloquear el scroll
    // dentro del modal-body. Detener la propagación hacia el backdrop
    // soluciona el problema sin afectar el comportamiento del modal.
    const modalBody = elementoModal.querySelector(".modal-body");
    modalBody.addEventListener("touchmove", function (evento) {
      evento.stopPropagation();
    }, { passive: true });

    formulario.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      campoNombre.value = campoNombre.value.trim();
      const regalos = obtenerRegalosFormulario();

      if (!formulario.checkValidity()) {
        formulario.classList.add("was-validated");
        return;
      }

      const nuevaLista = {
        idLista: generarIdLista(),
        nombre: limitar(campoNombre.value, 80),
        regalos: regalos,
        fechaRegistro: fechaRegistroActual()
      };

      const confirmacion = await Swal.fire({
        title: "¿Publicar tu lista?",
        html: resumenConfirmacion(nuevaLista),
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, publicar",
        cancelButtonText: "Volver a revisar",
        confirmButtonColor: "#8f1d2c",
        cancelButtonColor: "#6c757d",
        reverseButtons: true,
        focusCancel: true,
        showLoaderOnConfirm: true,
        allowOutsideClick: function () {
          return !Swal.isLoading();
        },
        preConfirm: async function () {
          try {
            await enviarDeseo(nuevaLista);
            return true;
          } catch (error) {
            Swal.showValidationMessage("No se pudo guardar: " + error.message);
            return false;
          }
        }
      });

      if (!confirmacion.isConfirmed) return;

      const filasNuevas = nuevaLista.regalos.map(function (regalo) {
        return normalizarRegistro({
          idLista: nuevaLista.idLista,
          nombre: nuevaLista.nombre,
          regalo: regalo.regalo,
          detalles: regalo.detalles,
          enlace: regalo.enlace,
          fechaRegistro: nuevaLista.fechaRegistro
        }, false);
      });
      deseos.push.apply(deseos, filasNuevas);
      renderTabla();
      limpiarFormulario(formulario);
      modalDeseo.hide();

      Swal.fire({
        title: "¡Lista publicada!",
        text: "Tus regalos ya forman parte del intercambio.",
        icon: "success",
        confirmButtonColor: "#164b3b",
        timer: 2300,
        timerProgressBar: true
      });
    });
  }

  function configurarActualizacion() {
    const boton = document.getElementById("btnActualizar");
    const icono = boton.querySelector("i");

    boton.addEventListener("click", async function () {
      boton.disabled = true;
      icono.classList.add("girando");

      const actualizado = await refrescarDatos();

      icono.classList.remove("girando");
      boton.disabled = false;

      if (actualizado) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Lista actualizada",
          showConfirmButton: false,
          timer: 1800,
          timerProgressBar: true
        });
      }
    });
  }

  function configurarNieve() {
    const contenedor = document.getElementById("nieve");
    const totalCopos = 34;

    for (let indice = 0; indice < totalCopos; indice++) {
      const copo = document.createElement("span");
      const direccion = indice % 2 === 0 ? 1 : -1;

      copo.className = "copo-nieve";
      copo.textContent = indice % 4 === 0 ? "❄" : "•";
      copo.style.setProperty("--posicion", ((indice * 37) % 101) + "%");
      copo.style.setProperty("--tamano", (0.5 + (indice % 5) * 0.18) + "rem");
      copo.style.setProperty("--duracion", (7 + (indice % 7) * 1.1) + "s");
      copo.style.setProperty("--retraso", -((indice * 1.7) % 13) + "s");
      copo.style.setProperty("--deriva", direccion * (16 + (indice % 4) * 9) + "px");
      contenedor.appendChild(copo);
    }
  }

  function escribirNumeroReloj(id, valor) {
    document.getElementById(id).textContent = String(valor).padStart(2, "0");
  }

  function mostrarConvivioHoy() {
    if (document.body.classList.contains("evento-hoy")) return;

    document.body.classList.add("evento-hoy");
    document.getElementById("etiquetaHero").textContent = "¡Llegó el gran día!";
    document.getElementById("tituloPrincipal").textContent = "¡Es hoy!";
    document.getElementById("descripcionPrincipal").textContent =
      "Nuestro convivio ha llegado. Disfrutemos este intercambio y cada detalle preparado con cariño.";
    document.getElementById("regaloHoy").classList.remove("d-none");
  }

  function actualizarRelojConvivio() {
    const ahora = new Date();
    const inicioConvivio = new Date(2026, 11, 5, 0, 0, 0);
    const finConvivio = new Date(2026, 11, 6, 0, 0, 0);
    const descripcion = document.getElementById("textoCuentaConvivio");

    if (ahora >= inicioConvivio && ahora < finConvivio) {
      escribirNumeroReloj("relojDias", 0);
      escribirNumeroReloj("relojHoras", 0);
      escribirNumeroReloj("relojMinutos", 0);
      escribirNumeroReloj("relojSegundos", 0);
      descripcion.textContent = "¡nuestro convivio es hoy!";
      mostrarConvivioHoy();
      return;
    }

    if (ahora >= finConvivio) {
      escribirNumeroReloj("relojDias", 0);
      escribirNumeroReloj("relojHoras", 0);
      escribirNumeroReloj("relojMinutos", 0);
      escribirNumeroReloj("relojSegundos", 0);
      descripcion.textContent = "convivio realizado";
      return;
    }

    const segundosTotales = Math.max(0, Math.floor((inicioConvivio - ahora) / 1000));
    const dias = Math.floor(segundosTotales / 86400);
    const horas = Math.floor((segundosTotales % 86400) / 3600);
    const minutos = Math.floor((segundosTotales % 3600) / 60);
    const segundos = segundosTotales % 60;

    escribirNumeroReloj("relojDias", dias);
    escribirNumeroReloj("relojHoras", horas);
    escribirNumeroReloj("relojMinutos", minutos);
    escribirNumeroReloj("relojSegundos", segundos);
    descripcion.textContent = "para nuestro convivio";
  }

  function iniciarRelojConvivio() {
    actualizarRelojConvivio();
    window.setInterval(actualizarRelojConvivio, 1000);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    configurarNieve();
    iniciarRelojConvivio();
    configurarFormulario();
    configurarActualizacion();
    await refrescarDatos();
  });
})();
