# Guía web · Crea y prueba agentes hablando con IBM Bob

Versión web de la guía visual v10 del taller IBM Bob + watsonx Orchestrate.
Página estática (HTML + CSS, sin build ni dependencias) con el mismo contenido
que el PDF distribuido a los participantes.

**Publicada en**: <https://miguelhgo.github.io/bob-orchestrate-guia/>
(pensada para compartir con business partners y gente sin cuenta de IBM).

Maintainer: Miguel Hidalgo.

## Ver en local

```sh
python3 -m http.server 8080
```

y abre <http://localhost:8080>.

(O simplemente doble clic en `index.html`; al no haber JavaScript ni fetch,
funciona también desde `file://`.)

## Estructura

- `index.html` — toda la guía en una sola página, con índice lateral.
- `styles.css` — tema claro (IBM Plex, azul #0F62FE, recuadros pálidos).
- `assets/` — capturas con nombres semánticos, revisadas y saneadas.

## Revisión de imágenes (hecha el 25-jul-2026, antes de publicar)

Las 16 capturas se repasaron una a una a tamaño completo:

- `env-credenciales-redactadas-v1.png` — URL y API key cubiertas con rectángulos.
- `guardar-env.png` — zona de credenciales tapada en negro (drawbox de ffmpeg).
- `abrir-agente.png` — recortada a la primera fila de tarjetas: las filas
  inferiores enseñaban agentes de un piloto de cliente y un agente admin.
- El resto no muestra credenciales, correos ni IDs de instancia (las barras de
  dirección solo enseñan el dominio regional público de Orchestrate).

Si se cambia cualquier captura, repetir esta revisión antes de hacer push.

## Pendiente

- [ ] Espejo interno en github.ibm.com (org del equipo) con Pages interno.
