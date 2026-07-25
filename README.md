# Guía web · Crea y prueba agentes hablando con IBM Bob

Versión web de la guía visual v10 del taller IBM Bob + watsonx Orchestrate.
Página estática (HTML + CSS, sin build ni dependencias) con el mismo contenido
que el PDF distribuido a los participantes.

## Ver en local

```sh
python3 -m http.server 8080
```

y abre <http://localhost:8080>.

(O simplemente doble clic en `index.html`; al no haber JavaScript ni fetch,
funciona también desde `file://`.)

## Estructura

- `index.html` — toda la guía en una sola página, con índice lateral.
- `styles.css` — tema claro espejo del PDF (IBM Plex, azul #0F62FE, recuadros pálidos).
- `assets/` — capturas con nombres semánticos, ya revisadas y saneadas.

## Antes de desplegar (pendiente — de momento SOLO local)

- [ ] Repasar de nuevo **cada** imagen de `assets/` a tamaño completo: ninguna
      API key, URL de instancia, correo ni nombre de cuenta visible.
      (`guardar-env.png` y `env-credenciales-redactadas-v1.png` ya van tapadas;
      verificar que el tapado cubre todo en pantallas de alta densidad.)
- [ ] Confirmar que el texto no menciona instancias ni credenciales.
- [ ] Si el público es IBM interno, cambiar el correo del pie (y el `mailto:`)
      por el correo de IBM de Miguel en vez del personal.
- [ ] Decidir dominio/hosting (GitHub Pages es suficiente: estático puro).
- [ ] Actualizar la línea de versión si el contenido cambió respecto al PDF.
