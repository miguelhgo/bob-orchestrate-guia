# Madrid 3D · Paseo de la Castellana

Maqueta 3D interactiva de la zona de la Castellana en Madrid, construida con
[Three.js](https://threejs.org) (r128) y `OrbitControls`. Todo va **incrustado
en un único `index.html`** (la librería incluida), así que funciona sin conexión
y sin dependencias externas.

## Realismo geográfico

Los edificios se colocan con **coordenadas reales** (lat/lon proyectadas a metros
mediante proyección equirectangular alrededor de un centro en AZCA), con
**alturas reales**, de modo que **las distancias y posiciones relativas son
correctas**. El render usa cristal PBR con reflejos del cielo (*environment map*
por PMREM), tone mapping ACES y niebla atmosférica para la lejanía.

> Nota: no es fotogrametría (tipo Google Earth); eso requiere servidores de
> *tiles* externos con clave de API, no disponibles en este entorno. Es un modelo
> geométrico con datos reales de posición y altura, y proporciones aproximadas.

## Qué incluye

- 🏟️ **Estadio Santiago Bernabéu** (~52 m) — piel metálica de lamas verticales
  onduladas, anillo superior y cubierta.
- 🏢 **AZCA**: **Torre Picasso** (157 m, blanca con esquinas redondeadas),
  **Torre Europa** (121 m), **Torre BBVA / Castellana 81** (107 m, bandas
  rojizas de Sáenz de Oíza) y **Torre Titania** (104 m).
- 🏛️ **Nuevos Ministerios** — complejo en U con arcada de columnas y torre central.
- 🌆 **Cuatro Torres (CTBA)** al norte, a ~3,2 km reales: Cristal (249 m),
  Cepsa (248 m), PwC (236 m), Espacio (224 m) y Caleido (181 m).
- 🌳 Paseo de la Castellana con mediana, coches en movimiento, arbolado, base
  cartográfica con trama de calles, sombras y luz de mediodía.

## Dos versiones

| Fichero | Qué es | Conexión |
|---------|--------|----------|
| `index.html` | Maqueta geométrica con datos reales (offline). | Ninguna. Funciona sin internet. |
| `earth.html` | **Google Earth fotorrealista** (Photorealistic 3D Tiles). | Tu navegador se conecta a Google. |

### `earth.html` — fotorrealista (Google Earth)

Muestra la ciudad real con la fotogrametría de Google. **La conexión ocurre en tu
dispositivo, no en el servidor** que generó estos ficheros. Requiere:

1. Una **API key de Google Maps Platform** con el **Map Tiles API** habilitado
   (consola de Google Cloud → APIs de Maps → *Map Tiles API* → Credenciales →
   Crear clave). Tiene capa gratuita.
2. Servir la página desde un origen web (no `file://`), porque Google exige un
   `Origin` válido por CORS. Lo más sencillo es **GitHub Pages**:
   *Settings → Pages → Deploy from a branch →* elige esta rama y la carpeta raíz.
   Luego abre `…/madrid-3d/earth.html` en Safari.

La clave se pide en pantalla la primera vez y se guarda **solo en tu móvil**
(`localStorage`); nunca se sube al repositorio. Doble toque en el título para
borrarla. Motor: [CesiumJS](https://cesium.com) cargado desde CDN por tu navegador.

> ⚠️ Esta versión **no** funciona como "artifact" publicado de Claude: esas
> páginas bloquean por seguridad cualquier host externo, incluido Google.

## Cómo usarlo

Abre `index.html` en cualquier navegador moderno (Safari, Chrome…), o sirve
`earth.html` por web para la versión fotorrealista (ver arriba).

### Controles

| Acción | Escritorio | Móvil / iPhone |
|--------|------------|----------------|
| Girar la cámara | arrastrar con el ratón | 1 dedo |
| Zoom | rueda del ratón | pellizcar (2 dedos) |
| Desplazar | clic derecho + arrastrar | 2 dedos |
| Recentrar | botón ⌖ | botón ⌖ |
| Rotación automática | botón ↻ | botón ↻ |

Optimizado para pantalla completa en móvil (áreas seguras, sin zoom del
navegador, `pixelRatio` limitado para buen rendimiento en un iPhone 14 Pro).
