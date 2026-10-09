<script setup>
    import {ref, onMounted} from 'vue';
    import L from 'leaflet';
    import 'leaflet/dist/leaflet.css';
    import listings from '../../data/foodListing.json';

    const selectedListing = ref(null);

    let map = null;
    const markers = [];

    onMounted(() => {
        map = L.map('food-rescue-map').setView(
            [1.3008, 103.8555],
            14
        )

        L.tileLayer('https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=a3soRYRrrsDYTIFau8f0', {
            attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
        }).addTo(map);
    })
</script>

<template>
    <div id="food-rescue-map"></div>
</template>

<style scoped>
    #food-rescue-map {
    height: 520px;
    width: 50%;
    border-radius: 12px;
    z-index: 0;
    }
</style>