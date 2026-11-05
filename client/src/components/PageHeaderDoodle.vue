<script setup>
defineProps({ kind: { type: String, default: 'account' } })
</script>

<template>
  <div class="page-header-art" aria-hidden="true">
    <svg viewBox="0 0 240 180" fill="none" focusable="false">
      <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <g v-if="kind === 'dashboard'">
          <path d="m54 82 75-57 75 57M74 69v89h110V69" fill="currentColor" fill-opacity=".12" />
          <path d="M148 158v-49h23v49M88 92h37v32H88ZM106 92v32M88 108h37M44 141v19m-9-9h18" />
          <path d="M131 61c-7-11-20-2-13 6l13 12 13-12c7-8-6-17-13-6Z" fill="currentColor" fill-opacity=".15" />
        </g>
        <g v-else-if="kind === 'cooking'">
          <path d="M55 95h150c-4 38-26 60-75 60S59 133 55 95ZM77 155h106M46 84h167" fill="currentColor" fill-opacity=".12" />
          <path d="M96 64c-20-19 15-22-3-40M131 64c-20-19 15-22-3-40M166 64c-20-19 15-22-3-40M191 91l27-48" />
        </g>
        <g v-else-if="kind === 'fridge'">
          <rect x="100" y="20" width="95" height="140" rx="13" fill="currentColor" fill-opacity=".15" />
          <path d="M100 70h95M117 42v14M117 89v30M112 164v6M182 164v6M38 65v42M20 86h36M25 72l28 28M25 100l28-28" />
          <path d="M207 34v24M195 46h24M54 141h20M64 131v20" />
        </g>
        <g v-else-if="kind === 'analytics'">
          <path d="M44 142h162M57 140v-35h28v35M107 140V77h28v63M157 140V48h28v92" fill="currentColor" fill-opacity=".13" />
          <path d="m48 82 49-34 32 8 60-35m-24 0h24v24M38 36v15M31 43h15" />
          <path d="M208 110c-11-18-34-4-22 10l22 19 22-19c12-14-11-28-22-10Z" fill="currentColor" fill-opacity=".12" />
        </g>
        <g v-else-if="kind === 'scanning'">
          <path d="M86 24h105v130l-13-9-13 9-13-9-13 9-13-9-13 9-13-9-14 9V24Z" fill="currentColor" fill-opacity=".12" />
          <path d="M106 48h65M106 64h44M106 91h8m9 0h27m10 0h11M106 110h44m10 0h11M33 63V43h20M211 43h16v20M33 128v20h20M227 128v20h-16M53 80v42m8-42v42m11-42v42" />
        </g>
        <g v-else-if="kind === 'rescue'">
          <path d="M59 97h131l-12 63H72L59 97ZM83 95l23-35h42l23 35M115 117v23m24-23v23" fill="currentColor" fill-opacity=".12" />
          <path d="M129 26c-11-17-31-3-20 9l20 18 20-18c11-12-9-26-20-9ZM24 108l20-10 14 31-20 9M204 104l16 9-17 29-17-10M77 30l-5-12m107 19 10-10" />
        </g>
        <g v-else>
          <circle cx="142" cy="62" r="26" fill="currentColor" fill-opacity=".12" />
          <path d="M88 149c0-66 108-66 108 0Z" fill="currentColor" fill-opacity=".12" />
          <path d="M60 67c-11-17-31-3-20 9l20 18 20-18c11-12-9-26-20-9ZM203 33v21m-10-10h20M65 133v15m-7-7h14" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.page-header-art { position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none; z-index:-1; }
svg { position:absolute; right:-22px; bottom:-26px; width:clamp(150px,20vw,260px); color:var(--header-accent,#07877d); opacity:.2; transform:rotate(-9deg); }
@media(max-width:600px) { svg { width:170px; right:-40px; bottom:-25px; opacity:.13; } }
</style>
