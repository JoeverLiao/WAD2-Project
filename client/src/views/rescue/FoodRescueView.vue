<script setup>
  import {ref} from 'vue';
  import FoodRescueMap from '../../components/FoodRescueMap.vue';
  import foodListings from '../../../data/foodListing.json';

  const myListings = ref([
        {
            id: 10,
            foodName: 'Unopened Pasta',
            quantity: '2 packets',
            pickupArea: 'Bugis',
            pickupWindow: 'Today, 6 PM – 8 PM',
            status: 'available'
        },
        {
            id: 11,
            foodName: 'Canned Soup',
            quantity: '3 cans',
            pickupArea: 'Lavender',
            pickupWindow: 'Tomorrow, 12 PM – 3 PM',
            status: 'available'
        }
    ]);

    const collectionRequests = ref([
        {
            id: 1,
            foodName: 'Fresh Vegetables',
            requester: 'Alex',
            quantity: '1 bag',
            message: 'I can collect this evening.',
            status: 'pending'
        },
        {
            id: 2,
            foodName: 'Wholemeal Bread',
            requester: 'Jamie',
            quantity: '1 loaf',
            message: 'Can pick it up after 6 PM.',
            status: 'pending'
        }
    ])

    function addCollectionRequest({ listing, message }) {
      const newRequest = {
          id: Date.now(),
          foodName: listing.foodName,
          requester: 'Neighbour',
          quantity: listing.quantity,
          message: message || 'No message provided.',
          status: 'pending'
      }

      collectionRequests.value.unshift(newRequest)
    }

    function updateRequest(request, status) {
        request.status = status
    }
</script>

<template>
  <section aria-label="Neighbour Food Rescue">
    <h1>Neighbour Food Rescue</h1>
    <p>Assigned to: Gabriele (Full Circle)</p>
    <!-- TODO: Gabriele: posting, browsing, map, listing details, and claim/unclaim. -->
    <div class="collection-dashboard">
        <!-- My Listings -->
        <section class="dashboard-panel">
            <div class="panel-heading">
                <h2>My Listings</h2>
                <span>{{ myListings.length }} listings</span>
            </div>

            <div
                v-for="item in myListings"
                :key="item.id"
                class="dashboard-card"
            >
                <div>
                    <h3>{{ item.foodName }}</h3>
                    <p>{{ item.quantity }} · {{ item.pickupArea }}</p>
                    <small>{{ item.pickupWindow }}</small>
                </div>

                <span
                    class="status-badge"
                    :class="item.status"
                >
                    {{ item.status }}
                </span>
            </div>

            <p v-if="myListings.length === 0" class="empty-state">
                You haven't shared any food yet.
            </p>
        </section>

        <!-- Confirm Collections -->
        <section class="dashboard-panel">
            <div class="panel-heading">
                <h2>Confirm Collections</h2>
                <span>
                    {{ collectionRequests.filter(
                        request => request.status === 'pending'
                    ).length }} pending
                </span>
            </div>

            <div
                v-for="request in collectionRequests"
                :key="request.id"
                class="dashboard-card"
            >
                <div class="request-info">
                    <h3>{{ request.foodName }}</h3>
                    <p>
                        Requested by {{ request.requester }}
                    </p>
                    <p>{{ request.quantity }}</p>
                    <small>{{ request.message }}</small>
                </div>

                <div class="request-actions">
                    <template v-if="request.status === 'pending'">
                        <button
                            class="accept-button"
                            @click="updateRequest(request, 'accepted')"
                        >
                            Accept
                        </button>

                        <button
                            class="decline-button"
                            @click="updateRequest(request, 'declined')"
                        >
                            Decline
                        </button>
                    </template>

                    <span
                        v-else
                        class="status-badge"
                        :class="request.status"
                    >
                        {{ request.status }}
                    </span>
                </div>
            </div>

            <p
                v-if="collectionRequests.length === 0"
                class="empty-state"
            >
                No collection requests yet.
            </p>
        </section>
    </div>
    
    <FoodRescueMap 
      :listings="foodListings"
      @rescue-request="addCollectionRequest"
    />
  </section>
</template>

<style scoped>
  .collection-dashboard {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
        margin: 32px;
    }

    .dashboard-panel {
        background: #f7faf7;
        border: 1px solid #e1eae2;
        border-radius: 16px;
        padding: 22px;
        min-width: 0;
    }

    .panel-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 18px;
    }

    .panel-heading h2 {
        color: #164b35;
        font-size: 20px;
        margin: 0;
    }

    .panel-heading > span {
        color: #64776a;
        font-size: 12px;
    }

    .dashboard-card {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        background: white;
        border: 1px solid #e2eae3;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
    }

    .dashboard-card h3 {
        color: #234735;
        font-size: 16px;
        margin: 0 0 8px;
    }

    .dashboard-card p {
        color: #64776a;
        font-size: 13px;
        margin: 0 0 6px;
    }

    .dashboard-card small {
        color: #7b887e;
        font-size: 12px;
    }

    .request-info {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .request-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
    }

    .accept-button,
    .decline-button {
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        font-weight: 600;
    }

    .accept-button {
        background: #227b56;
        color: white;
    }

    .accept-button:hover,
    .rescue-button:hover {
        background: #164b35;
    }

    .decline-button {
        background: #fbe9e7;
        color: #a33c32;
    }

    .decline-button:hover {
        background: #f5d5d1;
    }

    .status-badge {
        padding: 5px 9px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        text-transform: capitalize;
        white-space: nowrap;
    }

    .status-badge.available,
    .status-badge.accepted {
        background: #e4f3e8;
        color: #227b56;
    }

    .status-badge.pending {
        background: #fff1d6;
        color: #946516;
    }

    .status-badge.declined {
        background: #fbe9e7;
        color: #a33c32;
    }

    .empty-state {
        color: #7b887e;
        font-size: 14px;
        text-align: center;
        padding: 24px 8px;
    }

</style>
