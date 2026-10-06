<template><div class="hero-split"><main><slot name="left" /></main><aside><slot name="right" /></aside><slot /></div></template>
<style scoped>.hero-split{display:grid;grid-template-columns:1.1fr .9fr;gap:3rem;align-items:center;text-align:left}</style>
