# 🎲 Simulador de Probabilidad — ¿La teoría tiene razón?

Aplicación web interactiva que compara la **probabilidad teórica** de un evento con la **frecuencia relativa** obtenida al simularlo muchas veces, validando la **Ley de los Grandes Números**.

> Proyecto de Análisis Numérico · Ingeniería de Sistemas · Universidad del Cauca

**Integrantes:** Royman, Leider Ceron, Yineidy Mamian, Fabian Dorado · Mario Elcias

---

## ✨ Características

| Sección | Qué ofrece |
|---|---|
| **Simulador** | Elección de experimento, número de repeticiones (hasta 1.000.000), animación de la convergencia en vivo, 8 indicadores (KPI), curva de convergencia con intervalo de confianza, gráfica teórico vs. simulado, histograma, tabla de frecuencias y prueba manual ensayo a ensayo. |
| **Análisis de error** | Repite la simulación con n = 10 … 100.000 y muestra que el error decrece como **1/√n** (escala log-log). |
| **Teoría** | Espacio muestral interactivo de los dados (36 resultados) y árbol de probabilidad de los fusibles; resumen de los conceptos aplicados. |
| **Acerca del proyecto** | Planteamiento, flujo de uso, equipo y tecnologías. |

Además: tema **claro/oscuro** (respeta la preferencia del sistema y se recuerda), diseño **adaptable** (móvil, tableta, escritorio), accesibilidad básica (etiquetas ARIA, foco visible, `prefers-reduced-motion`) y validación de datos de entrada.

## 🧪 Experimentos

1. **Dos dados** — P(suma = 7) = 6/36 = 1/6 ≈ 0,1667 (la suma objetivo es configurable, 2–12).
2. **Fusibles sin reemplazo** — caja con 20 fusibles, 5 defectuosos; se extraen 2. P(ambos defectuosos) = (5/20)·(4/19) = 1/19 ≈ 0,0526 (N y K configurables).

## 🚀 Ejecutar localmente

No requiere instalación ni compilación. Opciones:

```bash
# Opción 1: abrir directamente
# Doble clic en index.html

# Opción 2: servidor local (recomendado)
python -m http.server 8000
# luego abrir http://localhost:8000
```

> Requiere internet para cargar **Chart.js** y la tipografía desde CDN. Para uso 100 % offline, descargue `chart.umd.min.js` a `js/` y cambie la etiqueta `<script>` de `index.html`.

## 🌐 Despliegue en GitHub Pages

1. Cree un repositorio y suba el contenido de esta carpeta (`index.html`, `css/`, `js/`, `README.md`, `.nojekyll`).
2. **Settings → Pages → Build and deployment → Deploy from a branch** → rama `main`, carpeta `/ (root)`.
3. En 1–2 minutos estará en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.

## 🗂️ Estructura

```
Proyecto_1/
├── index.html        # Estructura de la interfaz (4 secciones)
├── css/style.css     # Estilos, temas claro/oscuro y responsive
├── js/app.js         # Simulación, estadística, gráficas e interacción
├── .nojekyll         # Evita el procesamiento de Jekyll en GitHub Pages
└── README.md
```

## 🧮 ¿Cómo funciona?

1. **Simulación Monte Carlo.** Cada ensayo usa un generador pseudoaleatorio (`Math.random`, o `mulberry32` si se indica una semilla para reproducir resultados).
   - *Dados:* suma de dos enteros uniformes en {1..6}.
   - *Fusibles:* se elige un índice entre N y el segundo entre los N−1 restantes (**sin reemplazo real**); un fusible es defectuoso si su índice es < K.
2. **Puntos de control.** Se guardan ≈240 instantáneas (espaciadas geométricamente) con éxitos, histograma, Σx y Σx². Con ellas se dibuja la convergencia y se anima sin volver a simular.
3. **Estadísticos.**
   - Frecuencia relativa: `f = éxitos / n`
   - Error absoluto: `|f − p|`; error relativo: `|f − p| / p`
   - IC 95 %: `p ± 1,96·√(p(1−p)/n)`
   - Media `x̄ = Σx/n` y varianza muestral `s² = (Σx² − n·x̄²)/(n−1)` de la variable aleatoria (suma S o nº de defectuosos X), contrastadas con sus valores teóricos.
4. **Análisis de error.** Para cada n se promedian `|f − p|` en R repeticiones y se compara con el valor esperado `√(2/π)·√(p(1−p)/n)`.

## 🛠️ Tecnologías

HTML5 · CSS3 (variables, Grid, Flexbox) · JavaScript ES6+ · [Chart.js 4.4.1](https://www.chartjs.org/) · Google Fonts (Inter, JetBrains Mono) · GitHub Pages.

## 💡 Recomendaciones de mejora

- Añadir más experimentos (moneda, ruleta, cumpleaños, urna con reemplazo).
- Probar la prueba de bondad de ajuste χ² para el histograma.
- Exportar resultados a CSV o imagen (PNG) de las gráficas.
- Incluir Chart.js localmente para funcionamiento sin conexión (PWA).
- Mover la simulación a un *Web Worker* si se desea superar los 10⁷ ensayos sin bloquear la interfaz.

## 📄 Licencia

Proyecto académico de uso educativo.
