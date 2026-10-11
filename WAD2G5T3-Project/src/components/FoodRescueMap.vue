<script setup>
    import {ref, onMounted} from 'vue';
    import L from 'leaflet';
    import 'leaflet/dist/leaflet.css';

    const props = defineProps({
        listings: {
            type: Array
        }
    })

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

        props.listings.forEach(item => {
            const marker = L.marker([
                item.latitude,
                item.longitude
            ]).addTo(map);

            marker.on('click', () => {
                selectedListing.value = item;
                map.panTo(
                    [item.latitude, item.longitude]
                )
            })
        })
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

    function openRescueModal(item) {
        selectAndGoToLocation(item)
        requestMessage.value = ''
        showRescueModal.value = true
    }

    function closeRescueModal() {
        showRescueModal.value = false
        requestMessage.value = ''
    }

    function submitRescueRequest() {
        if (!selectedListing.value) return

        emit('rescue-request', {
            listing: selectedListing.value,
            message: requestMessage.value.trim()
        })

        closeRescueModal()
    }

</script>


<template>
    <div class="map-container">
        <div class="section-heading">
            <div>
                <h2>Explore Map</h2>
                <p>Find food available in your neighbourhood.</p>
            </div>
            <span class="listing-count">
                {{ listings.length }} listings
            </span>
        </div>

        <div class="map-layout">
            
            <div class="map-wrapper">
                <div id="food-rescue-map"></div>
            </div>

            
            <div class="listings-container">
                <h3 class="listings-title">Available Food</h3>

                <div
                    v-for="item in listings"
                    :key="item.id"
                    :class="[
                        'map-card',
                        selectedListing?.id === item.id
                            ? 'selected-div'
                            : ''
                    ]"
                    @click="selectAndGoToLocation(item)"
                >
                    <div class="card-header">
                        <h3>{{ item.foodName }}</h3>
                        <span class="food-category">
                            {{ item.category }}
                        </span>
                    </div>

                    <p class="quantity">{{ item.quantity }}</p>

                    <div class="card-footer">
                        <span>📍 {{ item.pickupArea }}</span>
                        <small>{{ item.pickupWindow }}</small>
                    </div>

                    <button
                        class="rescue-button"
                        @click.stop="openRescueModal(item)"
                    >
                        Rescue this food
                    </button>
                </div>

                <p 
                    v-if="listings.length === 0" 
                    class="empty-state"
                >
                    No food listings available right now.
                </p>
            </div>
        </div>

        <!-- Rescue request modal -->
        <div
            v-if="showRescueModal && selectedListing"
            class="modal-overlay"
            @click.self="closeRescueModal"
        >
            <div class="rescue-modal">
                <button
                    class="modal-close"
                    aria-label="Close modal"
                    @click="closeRescueModal"
                >
                    &times;
                </button>

                <h2>Rescue this food</h2>
                <p class="modal-subtitle">
                    Send a collection request to the owner.
                </p>

                <div class="modal-item">
                    <h3>{{ selectedListing.foodName }}</h3>
                    <p>
                        {{ selectedListing.quantity }}
                        · {{ selectedListing.category }}
                    </p>
                    <p>📍 {{ selectedListing.pickupArea }}</p>
                    <p>Pickup: {{ selectedListing.pickupWindow }}</p>
                </div>

                <label for="request-message">
                    Message to the owner
                    <span>(optional)</span>
                </label>

                <textarea
                    id="request-message"
                    v-model="requestMessage"
                    placeholder="Let the owner know when you can collect it..."
                ></textarea>

                <div class="modal-actions">
                    <button
                        class="cancel-button"
                        @click="closeRescueModal"
                    >
                        Cancel
                    </button>

                    <button
                        class="rescue-button submit-button"
                        @click="submitRescueRequest"
                    >
                        Send request
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>



<style scoped>
    .map-container {
        background: #f7faf7;
        border: 1px solid #e1eae2;
        border-radius: 16px;
        padding: 24px;
        min-width: 0;
        color: #234735;
        margin: 30px;
    }

    .section-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
    }

    .section-heading h2 {
        margin: 0 0 6px;
        color: #164b35;
        font-size: 24px;
        font-weight: 700;
    }

    .section-heading p {
        margin: 0;
        color: #718174;
        font-size: 14px;
    }

    .listing-count {
        background: #e4f3e8;
        color: #227b56;
        border-radius: 20px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    
    .map-layout {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 20px;
        align-items: stretch;
    }

    .map-wrapper {
        min-width: 0;
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid #dce8de;
    }

    #food-rescue-map {
        height: 560px;
        width: 100%;
        z-index: 0;
    }

    
    .listings-container {
        background: #edf4ee;
        border: 1px solid #e1eae2;
        border-radius: 14px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        max-height: 560px;
        overflow-y: auto;
        box-sizing: border-box;
    }

    .listings-title {
        margin: 2px 0 4px;
        color: #164b35;
        font-size: 17px;
        font-weight: 700;
    }

    
    .map-card {
        background: #ffffff;
        color: #234735;
        border: 2px solid #dce8de;
        border-radius: 12px;
        padding: 14px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(22, 75, 53, 0.05);
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s ease,
            background-color 0.2s ease;
    }

    .map-card:hover {
        transform: translateY(-2px);
        border-color: #7bb38d;
        box-shadow: 0 5px 12px rgba(22, 75, 53, 0.1);
    }

    .map-card.selected-div {
        background: #e4f3e8;
        border-color: #278052;
        box-shadow: 0 4px 12px rgba(22, 75, 53, 0.12);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 10px;
    }

    .map-card h3 {
        margin: 0;
        color: #164b35;
        font-size: 16px;
        font-weight: 650;
        overflow-wrap: anywhere;
    }

    .food-category {
        background: #e4f3e8;
        color: #287347;
        padding: 4px 8px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
    }

    .selected-div .food-category {
        background: #ffffff;
    }

    .quantity {
        color: #64776a;
        font-size: 13px;
        margin: 0 0 12px;
    }

    .card-footer {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 10px;
        border-top: 1px solid #edf1ed;
    }

    .card-footer span {
        color: #496c56;
        font-size: 12px;
        font-weight: 500;
    }

    .card-footer small {
        color: #718174;
        font-size: 11px;
    }

    
    .rescue-button {
        width: 100%;
        margin-top: 12px;
        padding: 10px 12px;
        background: #227b56;
        color: #ffffff;
        border: 1px solid #227b56;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .rescue-button:hover {
        background: #164b35;
        border-color: #164b35;
    }

    .map-card:focus-visible,
    .rescue-button:focus-visible,
    .cancel-button:focus-visible {
        outline: 3px solid #65a77d;
        outline-offset: 2px;
    }

    .empty-state {
        color: #718174;
        font-size: 13px;
        text-align: center;
        padding: 20px 8px;
    }

    
    .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 2000;
        background: rgba(15, 35, 24, 0.55);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
    }

    .rescue-modal {
        position: relative;
        background: #f7faf7;
        color: #234735;
        width: 100%;
        max-width: 440px;
        padding: 28px;
        border: 1px solid #e1eae2;
        border-radius: 18px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        box-sizing: border-box;
    }

    .rescue-modal h2 {
        color: #164b35;
        font-size: 23px;
        margin: 0 0 6px;
    }

    .modal-subtitle {
        color: #718174;
        font-size: 13px;
        margin: 0 0 20px;
    }

    .modal-close {
        position: absolute;
        top: 12px;
        right: 16px;
        background: transparent;
        color: #64776a;
        border: none;
        font-size: 26px;
        cursor: pointer;
    }

    .modal-item {
        background: #edf4ee;
        border: 1px solid #dce8de;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 20px;
    }

    .modal-item h3 {
        margin: 0 0 10px;
        color: #164b35;
        font-size: 17px;
    }

    .modal-item p {
        margin: 6px 0;
        color: #64776a;
        font-size: 13px;
    }

    .rescue-modal label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
    }

    .rescue-modal label span {
        color: #718174;
        font-weight: 400;
    }

    .rescue-modal textarea {
        display: block;
        width: 100%;
        min-height: 100px;
        padding: 12px;
        border: 1px solid #dce5dd;
        border-radius: 8px;
        background: #ffffff;
        color: #234735;
        font: inherit;
        font-size: 13px;
        box-sizing: border-box;
        resize: vertical;
    }

    .rescue-modal textarea:focus {
        outline: 2px solid #65a77d;
        border-color: #278052;
    }

    .modal-actions {
        display: flex;
        gap: 10px;
        margin-top: 18px;
    }

    .modal-actions button {
        flex: 1;
        margin-top: 0;
    }

    .cancel-button {
        padding: 10px 12px;
        background: #ffffff;
        color: #496c56;
        border: 1px solid #dce5dd;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .cancel-button:hover {
        background: #edf4ee;
    }
</style>
