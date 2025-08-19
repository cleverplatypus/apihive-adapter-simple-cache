<template>
<div class="simple-request-cache-adapter-demo demo pico">
   <form @submit.prevent>
    <div class="controls">

        <div>
            <label for="service">Service</label>
            <select name="service" id="service" style="max-width: fit-content;" v-model="model.currentEndpoint">
                <option v-for="endpoint of controller.endpoints" :key="endpoint" :value="endpoint">{{ endpoint }}</option>
            </select>
        </div>
        <div v-for="param of Object.keys(controller.endpointParams)" :key="param">
            <label :for="param">{{ param }}</label>
            <select :id="param" name="param" v-model="model.currentEndpointParams[param]">
                <option v-for="value of controller.endpointParams[param]!.values" :key="value" :value="value">{{ value }}</option>
            </select>
        </div>
        <div class="grow"></div>
        <button @click="controller.runService(model.currentEndpoint, model.currentEndpointParams)">Run</button>
    </div>
    <hr>
   </form>
   <div>
    <div class="controls">
        <button disabled class="animate__animated outline secondary animate__faster" :class="{ 'animate__pulse': flashFetchCount }">Fetch count: {{ model.fetchCount }}</button>
        <button disabled class="animate__animated outline secondary animate__faster" :class="{ 'animate__pulse': flashResult }">Run service count: {{ model.runServiceCount }}</button>
    </div>
    <hr>
    <div class="controls"><div>Result</div><div class="grow"></div>
        <span v-if="model.currentRequestHash">
            <span v-if="currentCountDown > 0">Expires in {{ currentCountDown }}s</span>
            <span v-else>Will fetch again</span>
        </span>
        </div>
    <pre v-if="model.result" class="animate__animated animate__faster" :class="{ 'animate__pulse': flashResult }">{{ model.result }}</pre>
   </div>
</div>
</template>

<script setup lang="ts">
import { onBeforeMount, ref, watch } from 'vue';
import model from './demo-model';
import DemoController from './demo-controller';

const flashResult = ref(false);
const flashFetchCount = ref(false);
const currentCountDown = ref(-1);
let controller: DemoController;

onBeforeMount(() => {
    controller = new DemoController();
})

watch(() => model.fetchCount, () => {
    flashFetchCount.value = model.fetchCount > 0;
    setTimeout(() => {
        flashFetchCount.value = false;
    }, 700);
});
watch(() => model.runServiceCount, () => {
    flashResult.value = model.runServiceCount > 0;
    setTimeout(() => {
        flashResult.value = false;
    }, 700);
});
watch(() => model.currentEndpoint, () => {
    const params = controller.endpointParams;
    if(params) {
        for(const param of Object.keys(params)) {
            model.currentEndpointParams[param] = params[param]!.values[0];
        }
    }
});

watch(() => [model.currentRequestHash, model.runServiceCount, model.expirations[model.currentRequestHash || 'dummy']], () => {
    if(!model.currentRequestHash) {
        return;
    }
    currentCountDown.value = Math.round((model.expirations[model.currentRequestHash]! - Date.now()) / 1000);
})

setInterval(() => {
    if(!model.currentRequestHash) {
        return;
    }
    if(currentCountDown.value > 0) {
        currentCountDown.value--;
    }
}, 1000)
</script>

<style lang="scss" scoped>

.simple-request-cache-adapter-demo {
    .controls {
        display: flex;
        gap: 1rem;
        align-items: center;
        .grow {
            flex-grow: 1;
        }
    }

    pre {
        padding: 1rem;
    }
}
</style>