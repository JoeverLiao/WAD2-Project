<script setup>
    import {ref, onMounted} from 'vue';
    import L from 'leaflet';
    import 'leaflet/dist/leaflet.css';


    const emit = defineEmits(['rescue-request'])


    const selectedListing = ref(null);
    const showRescueModal = ref(false)
    const requestMessage = ref('')

    
    let map = null;
    const markers = [];

    onMounted(() => {
        
        map = L.map('food-rescue-map').setView([1.3008, 103.8555], 14)

        L.tileLayer(
        'https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=a3soRYRrrsDYTIFau8f0',
        {
            attribution:
            '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
        },
        ).addTo(map)

        // props.listings.forEach(item => {
        //     const marker = L.marker([
        //         item.latitude,
        //         item.longitude
        //     ]).addTo(map);

        //     marker.on('click', () => {
        //         selectedListing.value = item;
        //         map.panTo(
        //             [item.latitude, item.longitude]
        //         )
        //     })
        // })
    })

    function selectAndGoToLocation(item){
        selectedListing.value = item;

        if (map.getCenter().lat === item.latitude && map.getCenter().lng === item.longitude) {
            return
        }

        map.panTo(
            [item.latitude, item.longitude]
        )
    }

</script>


<template>
    <div style="display: flex; margin-top: 50px;">
        <div id="food-rescue-map"></div>
        <div class="map-container">
        hello
        </div>
        
    </div>
    
    
</template>



<style scoped>
    .map-container {
        background: #7CDDD1;
        border: 5px solid #123F3B;
        border-left: none;
        border-radius: 0 16px 16px 0;
        box-shadow: 8px 10px 0 #123F3B;
        padding: 24px;
        color: #234735;
        margin: 0;
        width: 500px;
        z-index: 1;
    }

    #food-rescue-map {
        height: 560px;
        width: 50%;
        z-index: 0;
        border: 5px solid #123F3B;
        border-right: none;
        border-radius: 16px 0 0 16px;
        box-shadow: 8px 10px 0 #123F3B;
    }
</style>
