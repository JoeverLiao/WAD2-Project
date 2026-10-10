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

      listings
        .filter(item => item.status === 'available')
        .forEach(item => {
            const marker = L.marker([
                item.latitude,
                item.longitude
            ]).addTo(map);
        })
    })

    function goToLocation(location){
        if (map.getCenter().lat == location[0] && map.getCenter().lng == location[1]){
            return;
        }

        map.panTo(
            location
        )
    }

</script>

<template>
    <div style="display: flex;">
        <div id="food-rescue-map"></div>
        <div class="listings-container">
            <div class="map-card" @click="goToLocation([item.latitude, item.longitude])"
                v-for="item in listings"
                :key="item.id"
            >
                <div class="card-header">
                    <h3>{{ item.foodName }}</h3>
                    <span class="food-category">{{ item.category }}</span>
                </div>

                <p class="quantity">{{ item.quantity }}</p>

                <div class="card-footer">
                    <span>📍{{ item.pickupArea }}</span>
                    <small>{{ item.pickupWindow }}</small>
                </div>
            </div>
        </div>
    </div>
    
</template>

<style scoped>
    #food-rescue-map {
    height: 520px;
    width: 50%;
    border-radius: 12px 0px 0px 12px;
    z-index: 0;
    }
    
    .listings-container {
        background-color: #edf4ee;
        width: 400px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-radius: 0px 12px 12px 0px;
        box-sizing: border-box;
    }

    .map-card {
        background-color: #ffffff;
        color: #234735;
        border: 1px solid #dce8de;
        padding: 10px;
        border-radius: 14px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(22, 75, 53, 0.06);
        transition: transform 0.2s ease, box-shadow 0.2s ease,
                    border-color 0.2s ease;
    }

    .map-card:hover {
        transform: translateY(-3px);
        border-color: #4b956c;
        box-shadow: 0 6px 16px rgba(22, 75, 53, 0.12);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 10px;
    }

    .map-card h3 {
        font-size: 18px;
        font-weight: 650;
        margin: 0;
    }

    .food-category {
        background-color: #e4f3e8;
        color: #287347;
        padding: 4px 9px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
    }

    .quantity {
        color: #64776a;
        font-size: 14px;
        margin: 0 0 16px;
    }

    .card-footer {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 12px;
        border-top: 1px solid #edf1ed;
    }

    .card-footer span {
        font-size: 13px;
        font-weight: 500;
    }

    .card-footer small {
        color: #718174;
        font-size: 12px;
    }

    .map-card:focus-visible {
        outline: 3px solid #65a77d;
        outline-offset: 2px;
    }

</style>