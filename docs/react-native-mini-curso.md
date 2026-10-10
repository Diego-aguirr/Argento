# React Native para devs de React — mini curso

Documento personal de aprendizaje: qué cambia al pasar de React (web) a React Native, y cómo se aplica en Argento. No es documentación de contribución del repo.

## La diferencia de fondo (lee esto primero)

En React web tu código renderiza al **DOM**: el navegador dibija `<div>`, `<p>`, `<img>`.
En React Native **no hay navegador, no hay DOM**. Tu código renderiza *componentes nativos reales* del sistema operativo: `View` se convierte en una vista nativa de iOS/Android, `Text` en un label nativo, `Image` en la vista de imágenes nativa.

```
React web:   tu JS  →  DOM del navegador  →  píxeles
React Native: tu JS  →  JSI/Hermes  →  Fabric (render)  →  píxeles NATIVOS (UIKit / Android Views)
```

Consecuencias prácticas de esa diferencia:

| En React web... | En React Native... |
|---|---|
| Escribes HTML (`<div>`, `<span>`) | Escribes componentes host (`View`, `Text`) — el JSX se transforma en llamadas a componentes nativos |
| CSS completo: selectores, cascada, `position: sticky` | Estilos en camelCase, subset limitado, **flexbox por defecto en columna** |
| Hay `window`, `document`, `localStorage` | No existe ninguna API del DOM. Storage = `AsyncStorage` u otra librería |
| Layout se calcula en el navegador | Layout lo calcula **Yoga** (motor de flexbox escrito en C++, compartido) |
| Se despliega como sitio web | Se empaqueta en un **binario nativo** que envuelve tu bundle de JS |

## 1. El modelo de ejecución (lo esencial)

Argento corre así por debajo:

- **Hermes**: el motor JS de React Native. Compila tu JS a bytecode en el build, arranca más rápido que V8/JSC.
- **JSI (JavaScript Interface)**: puente cero-copy entre JS y código nativo. Reemplazó al viejo "bridge" JSON de años anteriores — ya no hay serialización lenta por frame.
- **Fabric**: el sistema de render nuevo (New Architecture). Tu componente se vuelve un nodo en el árbol de vistas **nativo**, no en un árbol simulado.
- **TurboModules**: cómo tu JS llama APIs nativas (cámara, filesystem, picker). Carga perezosa, tipado.

**Regla práctica**: los componentes nativos viven en el hilo de UI; tu JS corre en su propio hilo (el "JS thread"). Si el JS thread se bloquea, la UI nativa *sigue viva* (los gestos responden) pero tu pantalla no reacciona. De ahí vienen muchas reglas de performance de la sección 8.

## 2. Componentes base: el equivalente HTML

| HTML / React web | React Native | Notas |
|---|---|---|
| `<div>`, `<section>`, `<main>` | `View` | Contenedor de layout. No tiene click; para tocar hay que usar `Pressable` (ver sección 5) |
| `<p>`, `<span>`, `<h1>` | `Text` | **Todo texto va dentro de un `Text`**. Un `View` con string adentro tira error |
| `<img>` | `Image` o `expo-image` | Argento usa `expo-image` (caché y rendimiento). Dimensiones fijas siempre |
| `<input>` | `TextInput` | Sin `placeholder` de HTML; props propias (`placeholderTextColor`) |
| `<button>`, `<a>` | `Pressable` | `Pressable` es el componente táctil genérico (estados pressed/disabled) |
| `<ul>` + scroll | `ScrollView` | Envuelve contenido; **no** sirve para listas de datos (ver sección 8) |
| scroll virtualizado | `FlatList` / `FlashList` | Lista con recycling de filas |
| `<form>` | No existe | Formularios = composición de `TextInput` + lógica |
| `<span style="...">` inline | Casi nunca | Sin `StyleSheet.create` en filas de lista |

Ejemplo mínimo — esto es un componente RN completo:

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';

export function HelloCard({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
      <Text style={styles.title}>Hola {name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600' },
});
```

## 3. Estilos: el CSS que no vas a extrañar (mucho)

- **camelCase en objetos de JS**: `backgroundColor`, no `background-color`. Sin hojas `.css`, sin importar estilos.
- **Sin cascada, sin selectores, sin herencia**: cada componente recibe sus estilos. Gana claridad, perdés atajos.
- **Unidades relativas al texto**: `fontSize: 18` = 18pt densidad-independent (no px). `margin: '5%'` funciona; `rem`/`em` no.
- **Flexbox por defecto, y la dirección por defecto es columna** (en web es fila). Esto engancha a todos al principio: `flexDirection: 'row'` es el que pones para alinear en horizontal.
- **`position: 'absolute'` existe**; `'sticky'`, `'fixed'`, `float`, `z-index` con cascada, grids CSS: no.
- **Sombras son props especiales**: `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius` — y en Android, `elevation` (propiedad nativa, comportamiento distinto).
- **Tipografía del sistema**: no heredas la font del padre automáticamente; cada `Text` define `fontSize`/`fontWeight` o usa un preset.
- **`StyleSheet.create` es la norma**: valida estilos en compile-time y los aplana. Objetos de estilo inline en render = re-renders y basura de memoria.

`Platform.select` para diferencias chicas:

```ts
const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  android: { elevation: 3 },
});
```

## 4. Layout: Yoga (flexbox) es toda la disciplina

Todo el layout de RN es flexbox calculado por Yoga. Las propiedades son las del CSS flex que ya conocés, con estas diferencias clave:

| Concepto | Web | React Native |
|---|---|---|
| Ancho/alto | Muchas veces `width: 100%` o auto | **Sin medida no hay render**: una `View` sin `flex` ni dimensiones se colapsa |
| Default del contenedor | fila (flex-row) | **columna** (flex-column) |
| `flex: 1` | ocupa el resto | igual, pero **el hijo directo de una pantalla casi siempre lo necesita** para estirarse |
| Overflow de texto | `overflow: hidden` / scroll | Un `Text` largo se corta si no tiene ancho; se corta y ya |
| Centering | margin auto / flex | `justifyContent` (eje principal) + `alignItems` (eje cruzado) |

Trucos que vas a ver todo el tiempo en Argento:

- `flex: 1` en el contenedor raíz de la pantalla para que ocupe la pantalla entera.
- `flexDirection: 'row'` + `gap` para filas (SÍ hay `gap`).
- `SafeAreaView` (o `useSafeAreaInsets`) para no dibujar detrás del notch/barra del sistema. **Nunca** hardcodees offsets de status bar.

## 5. Interacción: toques, no clicks

- **`onPress` en `Pressable`**, no `onClick` en `View`. Las `View` no reciben toques (es intencional: cualquier tap-through se programa explícitamente).
- **No hay hover** en táctil. Estados `:hover` no existen — diseñá para pressed.
- `Pressable` te da render-prop con `pressed`: para el feedback visual del toque.
- **Gestos complejos** (swipe, pinch, drag, long-press con tracking): `react-native-gesture-handler` + `react-native-reanimated` (ambos ya en Argento). En web serían eventos del mouse; acá son recognizers nativos corriendo en el hilo de UI.
- Feedback nativo que en web tenés que inventar: `ActivityIndicator` para loading, `Alert.alert` para diálogos nativos, haptic (`expo-haptics`).

## 6. Navegación: Expo Router (tipo Next.js)

Argento usa **Expo Router**: navegación por archivos, el mismo modelo que Next.js.

```
src/app/
  _layout.tsx        → root layout (define el Stack)
  index.tsx          → /
  (auth)/
    login.tsx        → /login
    onboarding.tsx   → /onboarding
  (tabs)/
    _layout.tsx      → tab navigator
    feed.tsx         → /feed
    profile.tsx      → /profile
```

Diferencias con el router web:

| Web (Next/React Router) | Expo Router |
|---|---|
| `<a href>` / `<Link href>` | `<Link href>` de `expo-router` (misma idea) |
| `useRouter().push()` | `router.push()` de `expo-router` |
| `useSearchParams()` | `useLocalSearchParams()` |
| Rutas = páginas web | Rutas = **pantallas** apiladas nativamente (stack real del SO) |
| El browser apila historial | El botón "atrás" del sistema operativo apila historial |
| Redirect | `<Redirect>` o `router.replace()` |

**Deep links**: el `scheme: "argento"` de `app.json` permite `argento://profile`. Las rutas del file-based router *son* los deep links.

**Guards**: no hay middleware. El patrón (usado en Argento) es un `RouteGuard` en el layout que redirige según sesión.

## 7. Datos, estado y storage

**Estado local y server state: igual que en React.** Hooks, `useState`, `useEffect`, librerías — no cambia nada conceptual.

Lo que cambia es el entorno alrededor:

| Web | React Native (Argento) |
|---|---|
| `localStorage` / `sessionStorage` | `AsyncStorage` (o `expo-secure-store` para tokens) — **async**, no síncrono |
| Cookies automáticas | No existen. Supabase maneja la sesión con el storage que le pasás |
| `fetch` nativo | Existe, pero Supabase-js en RN necesita el storage adapter (ya configurado en `src/lib/supabase/`) |
| DevTools del navegador | React DevTools standalone; Network lo ves con flipper/log |
| `.env` normal | Solo variables **`EXPO_PUBLIC_*`** llegan al bundle. El resto es backend, punto |

Regla de oro de Argento (y del ecosistema): **el server state vive en una capa `src/lib/supabase/*` que mapea filas snake_case → tipos camelCase**. Los componentes nunca ven columnas de la base.

## 8. Performance: de dónde salen los janks

Tres reglas de oro, en orden de importancia:

### 8.1 Listas: siempre virtualizadas

`ScrollView` + `.map()` con 100 filas crea 100 vistas nativas de una. Con 200+ filas usa **FlashList** (ya disponible en el ecosistema de Argento). `FlatList` con `keyExtractor` estable para listas chicas.

```tsx
<FlatList
  data={posts}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <PostCard post={item} />}
/>
```

### 8.2 Animaciones: hilo de UI, nunca setState

Un `setState` por frame para mover algo = 60 renders/segundo en el JS thread = jank garantizado. La forma correcta: **Reanimated 4** con *worklets* — la animación corre en el hilo de UI sin tocar JS.

```tsx
const progress = useSharedValue(0);
// corre en el hilo de UI, no re-renderiza React
const style = useAnimatedStyle(() => ({ opacity: progress.value }));
```

### 8.3 Imágenes: expo-image, medidas fijas

`expo-image` con caché, `contentFit`, y **siempre dimensiones conocidas** (sin medida = layout thrash mientras carga). En listas: thumbnails chicos; full-size solo en detalle.

### Otras reglas del repo

- **React Compiler está activo** en Argento: no escribas `useMemo`/`useCallback`/`React.memo` por reflejo; el compiler memoiza solo. Solo como escape hatch, y con comentario de por qué.
- **Cada `setTimeout`/`setInterval`/suscripción se limpia** en el cleanup del effect.
- Estilos de filas de lista: cero objetos inline.

## 9. Plataforma: iOS ≠ Android (pero cerca)

- `Platform.OS` → `'ios' | 'android' | 'web'` para diferencias mínimas.
- **Variantes de archivo** para divergencia real: `app-tabs.tsx` + `app-tabs.web.tsx`, `component.ios.tsx`, `component.android.tsx`. Metro resuelve el que corresponda por plataforma. (Argento usa esto: los tabs nativos vs web tienen implementaciones separadas.)
- Comportamientos que cambian: gestures del sistema (swipe-back en iOS, botón atrás en Android), fonts, sombras (ver sección 3), safe areas.

## 10. Builds y distribución — LA GRAN DIFERENCIA CON WEB

Esto es lo que hoy estamos viendo con EAS. Web deploy: subís estáticos. Nativo: hay un **binario** que compila.

### 10.1 Qué es cada cosa

| Concepto | Qué es |
|---|---|
| **Metro** | El bundler de RN (el "webpack/Vite" de React Native). Empaqueta todo tu JS + assets en un `bundle.js` |
| **Bundle JS** | Tu código JS compilado. **Puede actualizarse sin rebuild** (OTA) |
| **Binario nativo** | La app "de verdad": iOS (.ipa) / Android (.apk/.aab) que *incluye* el bundle y el runtime nativo |
| **Expo Go** | App de desarrollo para probar cambios de JS al instante. Solo incluye los módulos nativos *preinstalados* — si agregás un módulo nativo nuevo, no sirve |
| **Dev build** | Tu propia app de desarrollo (con tus módulos nativos compilados). `npx expo run:android` o `eas build --profile development` |
| **EAS Build** | Compilación en la **nube** de Expo: no necesitás Android Studio/Xcode. Sube tu código, compila el binario, te da el link |
| **EAS Update** | OTA: actualización del bundle JS por internet. **No puede** cambiar código nativo — eso requiere rebuild |
| **Runtime version** | Huella del binario. Un OTA solo se aplica a binarios con runtime compatible |

**Regla que lo explica todo**: si el cambio toca JS/assets → OTA. Si toca código nativo (dependencia nativa nueva, config plugin) → **rebuild obligatorio**.

### 10.2 Los perfiles de build (tu `eas.json`)

```json
{
  "build": {
    "preview":   { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": {}
  }
}
```

| Perfile | Para qué | Resultado |
|---|---|---|
| `development` | Dev con Expo Go alternativo (dev client) | Debug build |
| `preview` | Probar en tu celular / QA interna | **APK** (Android) — se instala directo |
| `production` | Store | **AAB** (Google Play) / .ipa (App Store) |

APK vs AAB: el APK lo instalás en cualquier celular; el AAB solo lo consume Google Play (genera los APK por dispositivo).

### 10.3 Firmado: keystore (Android) y versionCode

- **Keystore**: archivo `.jks`/`.keystore` que prueba que el APK salió de tu cuenta. **Si lo perdés, no podés actualizar la app en el store.** EAS lo genera y guarda cifrado en sus servidores (eso pasó en tu build: "✔ Created keystore") — o podés subir el tuyo.
- **`versionCode`**: número entero que sube en cada release de Android (empezó en 1). Google Play lo usa para saber cuál es más nuevo. iOS equivalente: `buildNumber`.
- **`bundleIdentifier` / `package`**: `com.clyde.argento` — la identidad única de la app en cada store. Una vez publicada, **no se puede cambiar**.

### 10.4 Lo que pasó hoy con tu build (caso de estudio)

```
eas build --profile preview
  → lee tu eas.json (perfil preview, APK interno)
  → genera/usa keystore remoto (firma)          ✅
  → versionCode = 1                              ✅
  → comprime proyecto (3 MB) y lo sube a EAS     ✅
  → calcula fingerprint (hash de config nativa)  ✅
  → la nube ejecuta el workflow:
      Install dependencies  ❌ ACÁ FALLO
      ...el resto no corrió
```

El build de EAS no usa tu máquina: un worker en la nube recibe tu código y corre ahí `install` + compile. Falló en *instalar dependencias*. La causa real (una vez leído su log):

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: unrs-resolver@1.12.2
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
pnpm install --frozen-lockfile exited with non-zero code: 1
```

**Qué es**: desde pnpm 10, por seguridad (supply-chain), **ninguna dependencia puede ejecutar sus scripts de post-instalación sin aprobación explícita**. En tu máquina pasaba porque es interactivo/ya tenés `node_modules`; en la nube, `--frozen-lockfile` non-interactive lo convierte en error duro.

La primera vuelta de fix (agregar `pnpm.onlyBuiltDependencies` a `package.json`) funcionó en local (pnpm 10.26) pero **falló igual en la nube** — porque EAS corre **pnpm 11**, que *eliminó* esa clave de `package.json` (la ignora "en silencio"). La config actual, válida en 10.26+ y 11, es `allowBuilds` en `pnpm-workspace.yaml`:

```yaml
# pnpm-workspace.yaml
allowBuilds:
  unrs-resolver: true
```

Lección triple: (1) el worker de EAS corre *exactamente* los mismos comandos que podés reproducir localmente (`pnpm install --frozen-lockfile`) — si lo rompés local, lo rompés en la nube; (2) pero **no siempre la misma versión del tool**: local pnpm 10, nube pnpm 11 — las claves de config tienen versiones de vida; (3) los logs de EAS vienen comprimidos (brotli) y firmados con URL de 15 min — el error nunca estaba en "Unknown error" del dashboard, estaba en el log de la fase.

**TL;DR de la movida**: `eas init` linkeó tu repo a un proyecto de EAS (`@soyafls/argento`, projectId en `app.json`); el primer `eas build` armó todo el pipeline de firma y subida; el worker de la nube falló instalando deps; se lee el log, se arregla la config, se relanza. El keystore y el proyecto quedaron creados — no se repiten.

## 11. Accesibilidad en móvil

- Todo elemento táctil: `accessibilityRole` + `accessibilityLabel` ("Agregar foto de perfil", no "botón").
- Estados: `accessibilityState` (disabled/selected/loading).
- Dynamic Type: no desactives `allowFontScaling`; capá con `maxFontSizeMultiplier` solo donde rompa layout.
- Color nunca es la única señal (icono o texto además del color).
- Targets táctiles ≥ 44×44pt.
- **Probá con VoiceOver (iOS) / TalkBack (Android)** antes de dar una pantalla por terminada.

## 12. Cheat sheet final (diferencias que más duelen)

| # | React web | React Native |
|---|---|---|
| 1 | `<div>` | `View` |
| 2 | `<p>` / `<span>` | `Text` (siempre envolviendo el texto) |
| 3 | `<button onClick>` | `Pressable onPress` |
| 4 | CSS file / modules | `StyleSheet.create` (camelCase, sin cascada) |
| 5 | flex default row | flex default **column** |
| 6 | `localStorage` | `AsyncStorage` / SecureStore (async) |
| 7 | hover / cursor | no existe; solo pressed |
| 8 | DOM APIs (`window`, `document`) | no existen |
| 9 | deploy web | build de binario nativo (EAS) |
| 10 | hot reload del browser | Metro HMR / OTA solo para JS |

## 13. Mapa de Argento con este mapa mental

| Qué querés entender | Dónde mirar |
|---|---|
| Rutas y guards | `src/app/`, `RouteGuard` en los layouts |
| Componentes de UI compartidos | `src/components/` (`avatar.tsx`, `post-card.tsx`) |
| Capa de datos Supabase (mapeo de filas) | `src/lib/supabase/` |
| Hooks de flujos (feed, crear post, perfil) | `src/hooks/` |
| Pipeline de imágenes (picker → base64 → upload) | `src/lib/image-picker.ts`, `src/lib/supabase/storage.ts` |
| Config nativa y builds | `app.json`, `eas.json` |
| Reglas del repo (TS estricto, perf, a11y) | `AGENTS.md` |

## Próximo paso

Cuando hayas tragado estas 12 secciones: abrí `src/app/(tabs)/feed.tsx` con el cheat sheet al lado y seguí un flujo completo (pantalla → hook → lib supabase). Todo lo del documento se materializa ahí.
