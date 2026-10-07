<template>
  <section class="feature-card">
    <header>
      <span class="feature-card__icon"><slot name="icon" /></span>
      <h3><slot name="title" /></h3>
    </header>
    <p><slot /></p>
  </section>
</template>
<style scoped>
.feature-card { padding:1rem 1.2rem; border:1px solid #ffffff22; border-left:.2rem solid #8b5cf6; border-radius:.6rem; background:#ffffff0a; text-align:left; }
.feature-card header { display:flex; align-items:center; gap:.5rem; }
.feature-card h3 { margin:0; font-size:.8em; color:#c4b5fd; }
.feature-card__icon { font-size:1.2em; }
</style>
