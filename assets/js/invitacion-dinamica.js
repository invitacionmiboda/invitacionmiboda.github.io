/* =============================================================================
   INVITACION DINAMICA  -  template_code: BOD_A_01
   -----------------------------------------------------------------------------
   Lee un JSON (mock local hoy, endpoint mañana) y pinta toda la invitacion
   usando las <template> que estan al final de index_dinamico.html.

   Flujo:
     1. DOMContentLoaded  -> se cachean las plantillas
     2. se resuelve la fuente de datos (?data= | ?guid= | ?slug= | default)
     3. fetch + validacion basica
     4. render de secciones en orden
     5. inicializaciones propias (countdown, RSVP, fondo parallax, musica)
     6. se inyecta assets/js/script.js  (fancybox / isotope / wow / preloader)

   IMPORTANTE: no modifica ningun archivo existente.
   ========================================================================== */

(function () {
    "use strict";

    /* ---------------------------------------------------------------------
       CONFIGURACION
       --------------------------------------------------------------------- */
    var CONFIG = {
        // Mientras no exista el backend se leen los JSON locales de ejemplo.
        useMock: true,

        // Invitacion "unica" (una sola URL, RSVP abierto -> rsvp.type = "1")
        mockDefault: "assets/data/invitacion-demo.json",

        // Invitacion "personalizada" (?guid=... , RSVP precargado -> rsvp.type = "2")
        mockPersonalizada: "assets/data/invitacion-demo-personalizada.json",

        // Cuando useMock = false se arma la URL real:
        //   por slug  -> endpointBase + "/" + slug
        //   por guid  -> endpointBase + "/guest/" + guid
        endpointBase: "https://api.tu-dominio.com/v1/invitations",

        // Fallback si el JSON no trae fondo para el RSVP
        rsvpDefaultBg: "assets/images/rsvp-bg.jpg",

        // Shapes decorativos de la seccion historia
        storyShapes: ["assets/images/story/shape.jpg", "assets/images/story/shape2.jpg"],

        // Script original de la plantilla (se inyecta al final)
        legacyScript: "assets/js/script.js"
    };

    var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    var ICONOS_ITINERARIO = {
        misa: "fas fa-church",
        cere: "fas fa-church",
        civi: "fas fa-file-signature",
        rece: "fas fa-champagne-glasses",
        coct: "fas fa-martini-glass",
        vals: "fas fa-music",
        bail: "fas fa-music",
        cena: "fas fa-utensils",
        brin: "fas fa-champagne-glasses",
        foto: "fas fa-camera-retro",
        otro: "fas fa-circle"
    };

    var ICONOS_REGALO = {
        bank: "fas fa-credit-card",
        cash: "fas fa-envelope-open-text",
        lvpl: "fas fa-store",
        amzn: "fab fa-amazon",
        sear: "fas fa-store",
        pald: "fas fa-store",
        link: "fas fa-gift"
    };

    var ETIQUETA_REGALO = {
        lvpl: "Ver mesa de regalos",
        amzn: "Ver mesa de regalos",
        sear: "Ver mesa de regalos",
        pald: "Ver mesa de regalos"
    };

    var ICONOS_SOCIAL = {
        inst: "fab fa-instagram",
        fb: "fab fa-facebook-f",
        tikt: "fab fa-tiktok",
        yt: "fab fa-youtube",
        x: "fab fa-x-twitter",
        tw: "fab fa-twitter",
        wa: "fab fa-whatsapp",
        web: "fas fa-globe"
    };

    var ROLES_PADRES = {
        mom_she: "Mamá de la novia",
        dad_she: "Papá de la novia",
        mom_he: "Mamá del novio",
        dad_he: "Papá del novio"
    };

    var TEMPLATES = {};

    /* ---------------------------------------------------------------------
       UTILIDADES
       --------------------------------------------------------------------- */
    function esc(value) {
        if (value === null || value === undefined) { return ""; }
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // Solo se permiten URLs http(s), mailto, tel o rutas relativas.
    // Bloquea javascript:, data:, vbscript: (XSS).
    function safeUrl(value, fallback) {
        var raw = String(value === null || value === undefined ? "" : value).trim();
        if (!raw) { return fallback || ""; }
        if (/^(https?:|mailto:|tel:)/i.test(raw)) { return raw; }
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) { return fallback || ""; }  // otro esquema -> fuera
        if (/^\/\//.test(raw)) { return fallback || ""; }                 // protocol-relative -> fuera
        return raw;                                                       // ruta relativa
    }

    function safeImg(value, fallback) {
        return safeUrl(value, fallback || "");
    }

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(String(value || "").trim());
    }

    function text(value) {
        return String(value === null || value === undefined ? "" : value).trim();
    }

    function has(value) {
        return text(value).length > 0;
    }

    function pad2(n) {
        return n < 10 ? "0" + n : String(n);
    }

    function normalizeType(value) {
        return text(value).toLowerCase();
    }

    // Ordena por z_index (o z-index) ascendente, respetando el orden original
    // cuando no viene el campo.
    function byZIndex(items) {
        return (Array.isArray(items) ? items.slice() : [])
            .map(function (item, i) {
                var z = item && (item.z_index !== undefined ? item.z_index : item["z-index"]);
                return { item: item, z: (z === undefined || z === null || z === "") ? i : Number(z), i: i };
            })
            .sort(function (a, b) {
                if (a.z === b.z) { return a.i - b.i; }
                return a.z - b.z;
            })
            .map(function (w) { return w.item; });
    }

    // "Uno, Dos,,Tres" -> ["Uno","Dos","","Tres"]  ("" = renglon en blanco)
    function splitList(value) {
        var parts = String(value === null || value === undefined ? "" : value).split(",");
        var out = parts.map(function (p) { return p.trim(); });
        while (out.length && out[out.length - 1] === "") { out.pop(); }
        while (out.length && out[0] === "") { out.shift(); }
        return out;
    }

    function linesHtml(value) {
        return splitList(value).map(function (line) {
            return line === "" ? "&nbsp;" : esc(line);
        }).join("<br>");
    }

    // "2026-11-28 17:00:00" -> Date local (evita corrimientos por zona horaria)
    function parseDate(value) {
        var raw = text(value);
        if (!raw) { return null; }
        var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(raw);
        if (m) {
            return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
        }
        var d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatDateLong(date) {
        if (!date) { return ""; }
        return MESES[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
    }

    /* ---------------------------------------------------------------------
       MOTOR DE PLANTILLAS
       {{ var }}   -> escapado
       {{{ var }}} -> HTML tal cual (solo para fragmentos generados aqui)
       --------------------------------------------------------------------- */
    function cacheTemplates() {
        var nodes = document.querySelectorAll("template[id^='tpl-']");
        Array.prototype.forEach.call(nodes, function (node) {
            TEMPLATES[node.id] = node.innerHTML;
        });
    }

    function tpl(id, vars) {
        var src = TEMPLATES[id];
        if (src === undefined) {
            throw new Error("Plantilla no encontrada: " + id);
        }
        vars = vars || {};
        return src.replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}|\{\{\s*([\w.-]+)\s*\}\}/g,
            function (match, rawKey, escKey) {
                if (rawKey !== undefined) {
                    var raw = vars[rawKey];
                    return (raw === null || raw === undefined) ? "" : String(raw);
                }
                return esc(vars[escKey]);
            });
    }

    /* ---------------------------------------------------------------------
       SANITIZADO DEL HTML LIBRE (generic_section)
       El contenido lo captura un admin, pero nunca se confia en el origen.
       --------------------------------------------------------------------- */
    var TAGS_PROHIBIDOS = ["script", "iframe", "object", "embed", "link", "meta",
        "style", "base", "form", "input", "button", "textarea", "select", "svg"];

    function sanitizeHtml(html) {
        var parsed = new DOMParser().parseFromString("<div id='sbx'>" + String(html || "") + "</div>", "text/html");
        var root = parsed.getElementById("sbx");
        if (!root) { return ""; }

        TAGS_PROHIBIDOS.forEach(function (tag) {
            Array.prototype.forEach.call(root.querySelectorAll(tag), function (node) {
                node.parentNode.removeChild(node);
            });
        });

        Array.prototype.forEach.call(root.querySelectorAll("*"), function (el) {
            Array.prototype.slice.call(el.attributes).forEach(function (attr) {
                var name = attr.name.toLowerCase();
                var value = attr.value || "";
                if (name.indexOf("on") === 0) {
                    el.removeAttribute(attr.name);
                } else if ((name === "href" || name === "src" || name === "xlink:href" || name === "formaction")
                    && !safeUrl(value)) {
                    el.removeAttribute(attr.name);
                } else if (name === "style" && /expression\s*\(|javascript:/i.test(value)) {
                    el.removeAttribute(attr.name);
                } else if (name === "srcdoc") {
                    el.removeAttribute(attr.name);
                }
            });
            if (el.tagName === "A") {
                el.setAttribute("target", "_blank");
                el.setAttribute("rel", "noopener noreferrer");
            }
        });

        return root.innerHTML;
    }

    /* ---------------------------------------------------------------------
       BLOQUES REUTILIZABLES
       --------------------------------------------------------------------- */
    function sectionTitle(title, desc, opts) {
        opts = opts || {};
        if (!has(title) && !has(desc) && !opts.icon) { return ""; }
        return tpl(opts.tplId || "tpl-section-title", {
            wrapper_class: opts.wrapperClass || "",
            span_class: has(title) ? "" : "d-none",
            h_class: (has(desc) ? "" : "d-none ") + (opts.hClass || ""),
            title: text(title),
            desc: text(desc),
            icon: opts.icon || ""
        });
    }

    function storyItem(img, title, desc, shape, flipped) {
        if (!has(title) && !has(desc) && !has(img)) { return ""; }
        return tpl("tpl-story-item", {
            img: safeImg(img),
            shape: shape,
            title: text(title),
            desc: text(desc),
            anim_img: flipped ? "fadeInRightSlow" : "fadeInLeftSlow",
            anim_text: flipped ? "fadeInLeftSlow" : "fadeInRightSlow"
        });
    }

    function placeDetails(item) {
        var out = "";
        if (has(item.hour)) { out += tpl("tpl-li-text", { text: item.hour }); }
        if (has(item.name)) { out += tpl("tpl-li-text", { text: item.name }); }
        if (has(item.address)) { out += tpl("tpl-li-text", { text: item.address }); }
        if (has(item.phone)) { out += tpl("tpl-li-icon-text", { icon: "fas fa-phone", text: item.phone }); }
        var url = safeUrl(item.url);
        if (url) {
            out += tpl("tpl-li-link", { url: url, text: text(item.url_label) || "Ver ubicación" });
        }
        return out;
    }

    function placesSection(section, sectionId, titleOpts) {
        if (!section) { return ""; }
        var items = byZIndex(section.items).map(function (item) {
            if (!item) { return ""; }
            return tpl("tpl-places-item", {
                img: safeImg(item.img),
                title: text(item.title),
                details: placeDetails(item)
            });
        }).join("");

        if (!items) { return ""; }

        return tpl("tpl-places", {
            section_id: sectionId,
            section_title: sectionTitle(section.title, section.desc, titleOpts || { wrapperClass: "mb-30" }),
            items: items
        });
    }

    /* ---------------------------------------------------------------------
       RENDERERS POR SECCION
       --------------------------------------------------------------------- */
    function renderHeader(cover) {
        var slot = document.querySelector("[data-slot='header']");
        if (!slot) { return; }
        var title = cover && has(cover.header_title) ? cover.header_title : "";
        slot.innerHTML = title ? tpl("tpl-header", { header_title: title }) : "";
    }

    function renderCover(data) {
        var cover = data.sections.cover;
        if (!cover) { return ""; }
        var date = parseDate(data.event_date);
        return tpl("tpl-cover", {
            img: safeImg(cover.img),
            desc: text(cover.desc),
            name: text(cover.name) || text(data.event_name),
            date_text: formatDateLong(date)
        });
    }

    function renderStoryMain(story) {
        if (!story) { return ""; }
        var items = "";
        items += storyItem(story.img_1, story.title_2, story.desc_2, CONFIG.storyShapes[0], false);
        items += storyItem(story.img_2, story.title_3, story.desc_3, CONFIG.storyShapes[1], true);
        var title = sectionTitle(story.title_1, story.desc_1, { tplId: "tpl-section-title-hero" });
        if (!items && !title) { return ""; }
        return tpl("tpl-story", { section_id: "story", section_title: title, items: items });
    }

    function renderStoryExtra(story) {
        if (!story) { return ""; }
        var item = storyItem(story.img_4, story.title_4, story.desc_4, CONFIG.storyShapes[0], false);
        if (!item) { return ""; }
        return tpl("tpl-story", { section_id: "story2", section_title: "", items: item });
    }

    function renderCta(story) {
        if (!story || (!has(story.title_5) && !has(story.desc_5))) { return ""; }
        return tpl("tpl-cta", {
            img: safeImg(story.img_5),
            title: text(story.title_5),
            desc: text(story.desc_5)
        });
    }

    function renderItinerary(itinerary) {
        if (!itinerary) { return ""; }
        var items = byZIndex(itinerary.items).map(function (item) {
            if (!item || (!has(item.title) && !has(item.hour))) { return ""; }
            var type = normalizeType(item.type);
            return tpl("tpl-itinerary-item", {
                icon: ICONOS_ITINERARIO[type] || ICONOS_ITINERARIO.otro,
                hour: text(item.hour),
                title: text(item.title),
                desc: text(item.desc),
                desc_class: has(item.desc) ? "" : "d-none"
            });
        }).join("");

        if (!items) { return ""; }

        return tpl("tpl-itinerary", {
            section_title: sectionTitle(itinerary.title, itinerary.desc, { wrapperClass: "mb-30" }),
            items: items
        });
    }

    function detailsBlock(title, descHtml) {
        if (!has(title) && !descHtml) { return ""; }
        return tpl("tpl-details-block", {
            title: text(title),
            desc: descHtml || "",
            desc_class: descHtml ? "" : "d-none"
        });
    }

    function renderDetails(details) {
        if (!details) { return ""; }
        var blocks = "";

        if (details.dresscode_for_all) {
            blocks += detailsBlock(details.all_title, esc(text(details.all_desc)));
        } else {
            blocks += detailsBlock(details.men_title, esc(text(details.men_desc)));
            blocks += detailsBlock(details.women_title, esc(text(details.women_desc)));
        }

        if (has(details.avoidcolors_desc)) {
            blocks += detailsBlock(details.avoidcolors_title, linesHtml(details.avoidcolors_desc));
        }

        if (has(details.nokids_title)) {
            blocks += detailsBlock(details.nokids_title, "");
        }

        if (!blocks) { return ""; }

        return tpl("tpl-details", {
            section_title: sectionTitle(details.title, details.dresscode_title, {
                wrapperClass: "mb-30",
                hClass: "none-border-bottom"
            }),
            blocks: blocks
        });
    }

    function guestOptions(max) {
        var total = parseInt(max, 10);
        if (!isFinite(total) || total < 1) { total = 9; }
        if (total > 30) { total = 30; }
        var out = "";
        for (var i = 1; i <= total; i++) {
            out += '<option value="' + pad2(i) + '">' + pad2(i) + "</option>";
        }
        return out;
    }

    function renderRsvp(rsvp) {
        if (!rsvp) { return ""; }
        var isPersonalizada = text(rsvp.type) === "2";

        var nameField = isPersonalizada
            ? tpl("tpl-rsvp-name-fixed", { name: text(rsvp.name) })
            : tpl("tpl-rsvp-name-open", {});

        var max = isPersonalizada ? rsvp.number_guests : (rsvp.max_guests || 9);

        return tpl("tpl-rsvp", {
            bg: safeImg(rsvp.bg_img, CONFIG.rsvpDefaultBg) || CONFIG.rsvpDefaultBg,
            title: text(rsvp.title),
            desc: text(rsvp.desc),
            name_field: nameField,
            guest_options: guestOptions(max)
        });
    }

    function giftBody(item) {
        var type = normalizeType(item.type);

        if (type === "bank") {
            var lines = [];
            if (has(item.bank_institution)) { lines.push(esc("Tarjeta " + text(item.bank_institution))); }
            if (has(item.data)) { lines.push("<b>" + esc(item.data) + "</b>"); }
            if (has(item.holder_name)) { lines.push(esc("A nombre de: " + text(item.holder_name))); }
            return lines.length ? "<p>" + lines.join("<br>") + "</p>" : "";
        }

        var body = "";
        if (has(item.desc)) { body += "<p>" + esc(item.desc) + "</p>"; }

        if (type !== "cash" && isHttpUrl(item.data)) {
            body += '<a class="theme-btn margin-bottom-15" href="' + esc(safeUrl(item.data)) +
                '" target="_blank" rel="noopener noreferrer">' +
                esc(ETIQUETA_REGALO[type] || "Ver más") + "</a>";
        }

        return body;
    }

    function renderGift(gift) {
        if (!gift) { return ""; }
        var items = byZIndex(gift.items).map(function (item) {
            if (!item) { return ""; }
            var body = giftBody(item);
            if (!has(item.title) && !body) { return ""; }
            return tpl("tpl-gift-item", {
                icon: ICONOS_REGALO[normalizeType(item.type)] || ICONOS_REGALO.link,
                title: text(item.title),
                body: body
            });
        }).join("");

        if (!items) { return ""; }

        return tpl("tpl-gift", {
            section_title: sectionTitle("", gift.title, {
                tplId: "tpl-section-title-icon",
                wrapperClass: "margin-bottom-10",
                icon: "fas fa-gift"
            }),
            desc: text(gift.desc),
            desc_class: has(gift.desc) ? "" : "d-none",
            items: items
        });
    }

    function renderParents(parents) {
        if (!parents) { return ""; }
        var items = Object.keys(ROLES_PADRES).map(function (key) {
            if (!has(parents[key])) { return ""; }
            return tpl("tpl-people-item", {
                name: text(parents[key]),
                role: ROLES_PADRES[key],
                role_class: ""
            });
        }).join("");

        if (!items) { return ""; }

        return tpl("tpl-people", {
            section_id: "parents",
            section_title: sectionTitle(parents.desc, parents.title, { wrapperClass: "margin-bottom-15" }),
            items: items
        });
    }

    function renderNames(section, sectionId) {
        if (!section || !has(section.data)) { return ""; }
        var names = splitList(section.data).map(function (name) {
            return name === "" ? tpl("tpl-name-spacer", {}) : tpl("tpl-name-line", { name: name });
        }).join("");

        if (!names) { return ""; }

        return tpl("tpl-names", {
            section_id: sectionId,
            section_title: sectionTitle(section.desc, section.title, { wrapperClass: "margin-bottom-15" }),
            names: names
        });
    }

    function renderSocial(social) {
        if (!social) { return ""; }
        var items = byZIndex(social.items).map(function (item) {
            if (!item) { return ""; }
            var url = safeUrl(item.url);
            if (!url) { return ""; }
            return tpl("tpl-social-item", {
                icon: ICONOS_SOCIAL[normalizeType(item.type)] || ICONOS_SOCIAL.web,
                title: text(item.title) || url,
                url: url
            });
        }).join("");

        if (!items) { return ""; }

        return tpl("tpl-social", {
            section_title: sectionTitle(social.title, social.desc, { wrapperClass: "mb-30" }),
            items: items
        });
    }

    function renderGeneric(html) {
        var clean = sanitizeHtml(html);
        if (!text(clean)) { return ""; }
        return tpl("tpl-generic", { html: clean });
    }

    function renderGallery(gallery) {
        if (!gallery) { return ""; }
        var items = (Array.isArray(gallery.items) ? gallery.items : []).map(function (entry) {
            var src = safeImg(typeof entry === "string" ? entry : (entry && (entry.img || entry.url)));
            return src ? tpl("tpl-gallery-item", { img: src }) : "";
        }).join("");

        if (!items) { return ""; }

        return tpl("tpl-gallery", {
            section_title: sectionTitle(gallery.desc, gallery.title, { wrapperClass: "margin-bottom-15" }),
            items: items
        });
    }

    /* ---------------------------------------------------------------------
       RENDER PRINCIPAL
       --------------------------------------------------------------------- */
    function render(data) {
        var s = data.sections || {};

        if (has(data.page_title)) { document.title = text(data.page_title); }
        if (has(data.tier)) { document.body.setAttribute("data-tier", normalizeType(data.tier)); }
        if (has(data.template_code)) { document.body.setAttribute("data-template", text(data.template_code)); }

        renderHeader(s.cover);

        var html = [
            renderCover(data),
            renderStoryMain(s.story),
            placesSection(s.location, "event", { wrapperClass: "mb-30" }),
            renderItinerary(s.itinerary),
            renderDetails(s.details),
            renderRsvp(s.rsvp),
            renderGift(s.gift),
            renderStoryExtra(s.story),
            renderCta(s.story),
            renderParents(s.parents),
            renderNames(s.godparents, "godparents"),
            renderNames(s.chambelan, "chambelan"),
            placesSection(s.accommodation, "accommodation", { wrapperClass: "mb-30" }),
            renderSocial(s.social_media),
            renderGeneric(s.generic_section),
            renderGallery(s.img_gallery)
        ].join("");

        document.getElementById("invitacion-root").innerHTML = html;
    }

    /* ---------------------------------------------------------------------
       INICIALIZACIONES POSTERIORES AL RENDER
       --------------------------------------------------------------------- */
    function initCountdown(data) {
        var node = document.getElementById("clock-dinamico");
        if (!node || !window.jQuery || !jQuery.fn.countdown) { return; }

        var date = parseDate(data.event_date);
        if (!date || date.getTime() <= Date.now()) {
            node.parentNode.parentNode.style.display = "none";
            return;
        }

        jQuery(node).countdown(date, function (event) {
            jQuery(this).html(event.strftime(""
                + '<div class="box"><div><div class="time">%D</div> <span>Días</span> </div></div>'
                + '<div class="box"><div><div class="time">%H</div> <span>Horas</span> </div></div>'
                + '<div class="box"><div><div class="time">%M</div> <span>Min</span> </div></div>'
                + '<div class="box"><div><div class="time">%S</div> <span>Seg</span> </div></div>'));
        });
    }

    function initRsvp(data) {
        var form = document.getElementById("contact-form-main");
        if (!form) { return; }

        var rsvp = (data.sections && data.sections.rsvp) || {};
        var successMsg = document.getElementById("success");
        var warningMsg = document.getElementById("warning");
        var errorMsg = document.getElementById("error");
        var attendYes = document.getElementById("attend");
        var attendNo = document.getElementById("not");
        var nameInput = document.getElementById("name");
        var guestSelect = form.querySelector("select[name='guest']");
        var placeholder = "Número de invitados";
        var phone = String(rsvp.whatsapp_phone || "").replace(/\D/g, "");

        function resetEstado() {
            attendYes.checked = true;
            guestSelect.disabled = false;
            guestSelect.value = placeholder;
        }

        function mostrar(el) {
            [successMsg, warningMsg, errorMsg].forEach(function (node) {
                if (node) { node.style.display = (node === el) ? "block" : "none"; }
            });
        }

        resetEstado();

        attendYes.addEventListener("change", function () {
            guestSelect.disabled = false;
            guestSelect.value = placeholder;
        });

        attendNo.addEventListener("change", function () {
            guestSelect.disabled = true;
            guestSelect.selectedIndex = 0;
        });

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            var nombre = text(nameInput && nameInput.value);
            var asiste = attendYes.checked;
            var invitados = text(guestSelect.value);

            if (!nombre) {
                if (warningMsg) { warningMsg.textContent = "Por favor, escribe tu nombre o el de tu familia."; }
                mostrar(warningMsg);
                return;
            }

            if (asiste && (!invitados || invitados === placeholder)) {
                if (warningMsg) { warningMsg.textContent = "Por favor, selecciona el número de invitados."; }
                mostrar(warningMsg);
                return;
            }

            if (!phone) {
                mostrar(errorMsg);
                return;
            }

            var lineas = [
                text(data.event_name) || "Invitación",
                "Confirmación de asistencia:",
                "Nombre: " + nombre,
                "Asistencia: " + (asiste ? "Sí asistiré" : "No asistiré")
            ];
            if (asiste) { lineas.push("Invitados: " + invitados); }
            if (has(rsvp.guest_guid)) { lineas.push("Folio: " + text(rsvp.guest_guid)); }

            mostrar(successMsg);
            window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(lineas.join("\n")), "_blank", "noopener");

            if (text(rsvp.type) !== "2") {
                form.reset();
            }
            resetEstado();
        });
    }

    // Fondo fijo que cambia segun la seccion visible (mismo comportamiento
    // que el bloque inline del index original, pero sobre el DOM dinamico).
    function initParallaxBackground() {
        var fixedBg = document.querySelector(".parallax-fixed-bg");
        var sections = document.querySelectorAll(".section-content-parallaxeable");
        if (!fixedBg || !sections.length || !("IntersectionObserver" in window)) { return; }

        var cache = {};
        Array.prototype.forEach.call(sections, function (sec) {
            var img = sec.dataset.bg;
            if (!img || cache[img]) { return; }
            var preload = new Image();
            preload.src = img;
            cache[img] = preload;
        });

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var img = entry.target.dataset.bg;
                if (!img) { return; }
                if (!entry.isIntersecting) {
                    fixedBg.style.backgroundImage = "none";
                    return;
                }
                if (cache[img] && cache[img].complete) {
                    fixedBg.style.backgroundImage = "url('" + img + "')";
                } else if (cache[img]) {
                    cache[img].onload = function () {
                        fixedBg.style.backgroundImage = "url('" + img + "')";
                    };
                }
            });
        }, { threshold: 0, rootMargin: "200px 0px" });

        Array.prototype.forEach.call(sections, function (sec) { io.observe(sec); });
    }

    // script.js siempre crea el boton flotante de musica; si la invitacion
    // no tiene musica contratada se retira.
    function applyMusicPreference(data) {
        if (data && data.has_music) { return; }
        var btn = document.querySelector(".music-toggle");
        if (btn && btn.parentNode) { btn.parentNode.removeChild(btn); }
    }

    // script.js inicializa Isotope apenas se inyecta, cuando las imagenes de
    // la galeria todavia no tienen alto -> quedan huecos enormes.
    // Se recalcula el layout conforme van cargando.
    function relayoutGallery() {
        if (!window.jQuery || !jQuery.fn.isotope) { return; }

        var $container = jQuery(".gallery-container");
        if (!$container.length) { return; }

        function layout() {
            if ($container.data("isotope")) { $container.isotope("layout"); }
        }

        if (jQuery.fn.imagesLoaded) {
            $container.imagesLoaded().progress(layout).always(layout);
        } else {
            jQuery(window).on("load", layout);
        }

        jQuery(window).on("resize.invitacionGallery", layout);
        layout();
    }

    /* ---------------------------------------------------------------------
       CARGA DEL SCRIPT ORIGINAL (fancybox, isotope, wow, preloader, ...)
       --------------------------------------------------------------------- */
    function bootLegacyScript(data) {
        var script = document.createElement("script");
        script.src = CONFIG.legacyScript;
        script.onload = function () {
            // Si window.load ya ocurrio, disparamos los handlers que script.js
            // acaba de registrar (preloader, isotope, smooth scrolling...).
            if (document.readyState === "complete" && window.jQuery) {
                jQuery(window).trigger("load");
            }
            applyMusicPreference(data);
            relayoutGallery();
        };
        script.onerror = function () { hidePreloader(); };
        document.body.appendChild(script);
    }

    function hidePreloader() {
        var preloader = document.querySelector(".preloader");
        if (!preloader) { return; }
        if (window.jQuery) { jQuery(preloader).fadeOut(400); }
        else { preloader.style.display = "none"; }
    }

    function showError(message) {
        hidePreloader();
        var box = document.getElementById("invitacion-error");
        var detail = document.getElementById("invitacion-error-detail");
        if (detail) { detail.textContent = message || ""; }
        if (box) { box.hidden = false; }
    }

    /* ---------------------------------------------------------------------
       ORIGEN DE LOS DATOS
       --------------------------------------------------------------------- */
    function resolveSource() {
        var params = new URLSearchParams(window.location.search);
        var guid = text(params.get("guid"));
        var slug = text(params.get("slug"));
        var custom = text(params.get("data"));

        // ?data= solo acepta rutas relativas dentro de assets/data/ (evita
        // que se cargue contenido de un origen arbitrario).
        if (custom && /^assets\/data\/[\w.-]+\.json$/.test(custom)) {
            return { url: custom, guid: guid };
        }

        if (CONFIG.useMock) {
            return { url: guid ? CONFIG.mockPersonalizada : CONFIG.mockDefault, guid: guid };
        }

        if (guid) {
            return { url: CONFIG.endpointBase + "/guest/" + encodeURIComponent(guid), guid: guid };
        }

        return { url: CONFIG.endpointBase + "/" + encodeURIComponent(slug), guid: "" };
    }

    function validate(data) {
        if (!data || typeof data !== "object") {
            throw new Error("La respuesta no tiene el formato esperado.");
        }
        if (!data.sections || typeof data.sections !== "object") {
            throw new Error("La invitación no contiene secciones.");
        }
        return data;
    }

    /* ---------------------------------------------------------------------
       ARRANQUE
       --------------------------------------------------------------------- */
    function start() {
        cacheTemplates();

        var source = resolveSource();

        fetch(source.url, { credentials: "omit", headers: { "Accept": "application/json" } })
            .then(function (res) {
                if (!res.ok) { throw new Error("HTTP " + res.status); }
                return res.json();
            })
            .then(validate)
            .then(function (data) {
                if (source.guid && data.sections.rsvp) {
                    data.sections.rsvp.guest_guid = source.guid;
                }

                render(data);
                initCountdown(data);
                initRsvp(data);
                initParallaxBackground();
                bootLegacyScript(data);
            })
            .catch(function (err) {
                showError("Intenta de nuevo más tarde. (" + err.message + ")");
                if (window.console) { console.error("[invitacion-dinamica]", err); }
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
