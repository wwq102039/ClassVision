<script setup>
import AssistantFloatingWindow from './components/AssistantFloatingWindow.vue'
</script>

<template>
  <van-config-provider>
    <router-view />
    <AssistantFloatingWindow />
  </van-config-provider>
</template>
