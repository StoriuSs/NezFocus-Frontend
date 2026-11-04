<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [React Concept Guide (for Vue Developers)](#react-concept-guide-for-vue-developers)
  - [Core Philosophy](#core-philosophy)
    - [1. Templating vs JSX](#1-templating-vs-jsx)
    - [2. State & Reactivity](#2-state--reactivity)
    - [3. Lifecycle](#3-lifecycle)
    - [4. Directives Replacement](#4-directives-replacement)
    - [5. Where this starter goes from here](#5-where-this-starter-goes-from-here)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# React Concept Guide (for Vue Developers)

The React ideas this starter relies on, mapped to what you know from Vue. The
two Vue habits that map less directly — Pinia stores and fetching in
`onMounted` — have their own pages: [state-management.md](./state-management.md)
(Zustand, and what goes in a store here) and
[data-fetching.md](./data-fetching.md) (TanStack Query).

## Core Philosophy

| Vue.js (Options/Composition)     | React (Functional Components)  |
| -------------------------------- | ------------------------------ |
| **Templates** (`<template>`)     | **JSX** (JavaScript + XML)     |
| **Reactivity** (Ref/Reactive)    | **Immutability** (State/Props) |
| **Directives** (`v-if`, `v-for`) | **JS Logic** (`&&`, `.map`)    |

### 1. Templating vs JSX

**Vue:**

```html
<template>
  <button @click="handleClick" :class="{ active: isActive }">{{ label }}</button>
</template>
```

**React:**

```tsx
export function Button({ label, isActive, onClick }) {
  // Logic lives WITH the markup.
  // Use 'clsx' or template literals for classes
  return (
    <button onClick={onClick} className={isActive ? 'active' : ''}>
      {label}
    </button>
  )
}
```

### 2. State & Reactivity

**Vue (Composition API):**

```ts
const count = ref(0)
const increment = () => count.value++
```

**React (Hooks):**

```ts
const [count, setCount] = useState(0) // Returns atomic value, not a ref proxy
const increment = () => setCount((prev) => prev + 1) // Setter function
```

> **Key Difference:** In React, when state changes, the _entire function re-runs_. In Vue, it's fine-grained dependency tracking. This is why `useEffect` dependency arrays are critical in React.

### 3. Lifecycle

| Vue Lifecycle | React Equivalent (useEffect)                              |
| ------------- | --------------------------------------------------------- |
| `onMounted`   | `useEffect(() => { ... }, [])`                            |
| `onUnmounted` | `useEffect(() => { return () => { /* cleanup */ } }, [])` |
| `watch(dep)`  | `useEffect(() => { ... }, [dep])`                         |

### 4. Directives Replacement

**Conditional Rendering (`v-if`):**

```tsx
// React
{
  isLoggedIn ? <AdminPanel /> : <LoginForm />
}
{
  hasError && <ErrorMessage />
}
```

**Lists (`v-for`):**

```tsx
// React uses .map()
<ul>
  {items.map((item) => (
    <li key={item.id}>{item.name}</li>
  ))}
</ul>
```

### 5. Where this starter goes from here

| Vue | Here |
| --- | --- |
| `vue-router` routes in one file | `RouteObject` lists per feature, assembled in `src/app/router.tsx` ([project-structure.md](./project-structure.md#adding-a-page)) |
| Pinia | Zustand, for the session and the theme only ([state-management.md](./state-management.md)) |
| Fetching in `onMounted` | TanStack Query hooks ([data-fetching.md](./data-fetching.md)) |
| `vue-i18n` | react-i18next ([i18n.md](./i18n.md)) |
| VeeValidate | React Hook Form + zod ([shadcn-forms.md](./shadcn-forms.md)) |
