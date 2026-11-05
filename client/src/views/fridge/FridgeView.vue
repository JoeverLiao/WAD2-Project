<script setup>
import { ref, onMounted, onBeforeUnmount, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, routerKey, routeLocationKey } from 'vue-router'
import { useInventoryStore } from '../../stores/inventory.js'
import { usePageLoading } from '../../utils/pageLoading.js'
import { useFoodTransfer } from '../../utils/foodTransfer.js'
import {
  amountLabel,
  dietTypeLabel,
  expiryBadge,
  expiryDays,
  expiryLabel,
  locationLabel,
  itemStorageName,
} from '../../utils/inventoryModel.js'
import EggLoader from '../../components/EggLoader.vue'
import FoodItemCard from '../../components/fridge/FoodItemCard.vue'
import FoodItemForm from '../../components/fridge/FoodItemForm.vue'
import FoodDragActions from '../../components/fridge/FoodDragActions.vue'
import FoodTransferOverlay from '../../components/fridge/FoodTransferOverlay.vue'
import FoodIcon from '../../components/FoodIcon.vue'
import FoodPreview from '../../components/fridge/FoodPreview.vue'
import NoticeIcon from '../../components/NoticeIcon.vue'
import { useFridgeSelection } from '../../composables/fridge/useFridgeSelection.js'
import { useFridgeDoor } from '../../composables/fridge/useFridgeDoor.js'
import { useFridgeLayout } from '../../composables/fridge/useFridgeLayout.js'
import { useFridgeDialogs } from '../../composables/fridge/useFridgeDialogs.js'
import { useFridgeActions } from '../../composables/fridge/useFridgeActions.js'
import { useFridgeGuidance } from '../../composables/fridge/useFridgeGuidance.js'
import { useFridgeDrag } from '../../composables/fridge/useFridgeDrag.js'

const props = defineProps({ embedded: { type: Boolean, default: false } })
const router = inject(routerKey, null)
const route = inject(routeLocationKey, null)
const inventory = useInventoryStore()
const { items, loading, error: errorMessage } = storeToRefs(inventory)
usePageLoading(loading, 'Loading your food')

// Refs shared across behaviors; each composable owns its private gesture/dialog state.
const saving = ref(false)
const shiftingFood = ref(false)
const actionPending = ref(false)
const cardActionPending = ref(false)
const kitchenStage = ref(null)
const foodTransfer = useFoodTransfer(kitchenStage)
const foodTooltip = ref(null)
const selectedCompartment = ref(null)
const expiryPanelOpen = ref(false)
const formVisible = ref(false)
const dialogRef = ref(null)

const {
  selectedFoodIds,
  selectionBox,
  beginFoodSelection,
  stopSelectionClick,
  selectFoodWithKeyboard,
  openFoodCompartment,
  selectedFoodsFor,
} = useFridgeSelection({
  shiftingFood,
  foodTooltip,
  openCompartment: (...args) => openCompartment(...args),
  items,
})

const {
  doorAngle,
  doorGesture,
  fridgeDoorOpen,
  fridgeLightOn,
  startDoorGesture,
  moveDoorGesture,
  endDoorGesture,
  toggleDoor,
} = useFridgeDoor({ kitchenStage })

const {
  activeStorage,
  animateStorageSlide,
  showStorage,
  searchQuery,
  fridgeSearch,
  clearSearch,
  showFoodName,
  scrollCompartment,
  storageOptions,
  storageIndex,
  currentStorage,
  fridgeDoorTitle,
  selectStorage,
  stepStorage,
  filteredItems,
  itemsInZone,
  pantryShelves,
  countItems,
  totalItems,
  expiredCount,
  expiringSoonCount,
} = useFridgeLayout({
  props,
  finishDrag: (...args) => finishDrag(...args),
  cancelActionReaction: (...args) => cancelActionReaction(...args),
  selectedFoodIds,
  foodTooltip,
  fridgeDoorOpen,
  selectedCompartment,
  expiryPanelOpen,
  formVisible,
  shiftingFood,
  getRecommendation: (...args) => getRecommendation(...args),
  guidanceDestinationLabel: (...args) => guidanceDestinationLabel(...args),
  items,
})

const {
  openLinkedCompartment,
  editingItem,
  defaultStorage,
  defaultStorageZone,
  handleDialogKeydown,
  expiryTrigger,
  leaveExpiryDropdown,
  closeExpiryPanel,
  openEditForm,
  closeForm,
  openCompartment,
  closeCompartment,
  compartmentItems,
  compartmentStatus,
  itemCount,
  expiryItems,
  expiryItemCount,
  discardingExpired,
  discardExpiredFoods,
  highlightFood,
  revealedFoodId,
  jumpToItem,
} = useFridgeDialogs({
  route,
  props,
  items,
  fridgeDoorOpen,
  dialogRef,
  selectedCompartment,
  expiryPanelOpen,
  formVisible,
  router,
  finishDrag: (...args) => finishDrag(...args),
  cancelActionReaction: (...args) => cancelActionReaction(...args),
  showStorage,
  filteredItems,
  errorMessage,
  saveFoodGroup: (...args) => saveFoodGroup(...args),
  selectedFoodIds,
  kitchenStage,
  searchQuery,
  selectStorage,
})

const {
  saveItem,
  consumeItem,
  discardItem,
  runCardAction,
  removeItem,
  saveFoodGroup,
  otherStorageOptions,
  moveToStorage,
} = useFridgeActions({
  saving,
  errorMessage,
  editingItem,
  foodTransfer,
  items,
  closeForm,
  showMovedStorageAdvice: (...args) => showMovedStorageAdvice(...args),
  selectedCompartment,
  showStorage,
  selectedFoodsFor,
  dialogRef,
  actionPending,
  shiftingFood,
  cardActionPending,
  selectedFoodIds,
  storageOptions,
})

const {
  getRecommendation,
  storageRecommendations,
  ignoredStorageRecommendations,
  movedStorageAdviceIds,
  movedStorageWarnings,
  showMovedStorageAdvice,
  arrangingFoodIds,
  arrangementError,
  guidanceBusy,
  guidanceDestination,
  guidanceDestinationLabel,
  arrangeableFoods,
  confirmArrangeAll,
  arrangeGuidance,
  setGuidanceIgnored,
  ignoreAllGuidance,
  foodDescription,
} = useFridgeGuidance({
  filteredItems,
  props,
  items,
  shiftingFood,
  saving,
  actionPending,
  errorMessage,
  selectedFoodIds,
  saveFoodGroup,
  foodTooltip,
})

const {
  draggedItemId,
  storageAction,
  dragPosition,
  dragAnchor,
  dragPlacement,
  windowWidth,
  draggedFood,
  draggingOutsideModal,
  actionReaction,
  setStageEmojiDragImage,
  startDrag,
  holdFood,
  moveHeldFood,
  releaseHeldFood,
  startModalDrag,
  updateModalDragVisibility,
  finishDrag,
  dropFromModalBackdrop,
  dropOnArea,
  dropOnAction,
  cancelActionReaction,
} = useFridgeDrag({
  items,
  selectedFoodIds,
  foodTooltip,
  shiftingFood,
  actionPending,
  kitchenStage,
  selectedCompartment,
  selectedFoodsFor,
  foodTransfer,
  errorMessage,
  saveFoodGroup,
  showStorage,
  consumeItem,
  discardItem,
})

const loadInventory = inventory.loadInventory
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
onMounted(async () => {
  if (!props.embedded) {
    await loadInventory()
    if (!disposed) openLinkedCompartment()
  }
})
defineExpose({ highlightFood })
</script>

<template>
  <div class="fridge-page-shell" :class="{ 'is-embedded': embedded }">
    <div class="smart-fridge-page">
      <p v-if="loading" class="status-message" role="status">
        Loading your saved inventory from MongoDB...
      </p>

      <div v-if="errorMessage" class="status-message error-message" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadInventory">Retry loading inventory</button>
      </div>

      <!-- The paper hero makes the page title and main action read like the other feature pages. -->
      <header v-if="!embedded" class="page-header paper hero fc-page-heading">
        <div>
          <p class="eyebrow">FULL CIRCLE · INVENTORY MANAGEMENT</p>
          <h1>My Smart Kitchen</h1>
          <p class="page-description">
            Switch between your fridge and pantry. Keep food visible, fresh and organised.
          </p>
        </div>
        <div class="header-actions">
          <span class="hero-doodle" aria-hidden="true"><FoodIcon kind="ice" /></span>
          <div
            class="expiry-dropdown"
            @pointerleave="leaveExpiryDropdown"
            @focusout="
              !discardingExpired &&
              !$event.currentTarget.contains($event.relatedTarget) &&
              (expiryPanelOpen = false)
            "
            @keydown.esc.stop.prevent="closeExpiryPanel"
          >
            <button
              ref="expiryTrigger"
              type="button"
              class="expiry-button"
              :aria-expanded="expiryPanelOpen"
              aria-controls="expired-food-dropdown"
              @click="expiryPanelOpen = !expiryPanelOpen"
            >
              <NoticeIcon name="bell" /> Expired
              <span class="expiry-count">{{ expiryItemCount }}</span>
            </button>
            <div v-if="expiryPanelOpen" class="expiry-dropdown-position">
              <section
                id="expired-food-dropdown"
                class="inventory-modal expiry-dropdown-panel"
                aria-labelledby="expiry-title"
              >
                <header class="modal-heading">
                  <div>
                    <p class="eyebrow">REDUCE FOOD WASTE</p>
                    <h2 id="expiry-title"><NoticeIcon name="bell" /> Expired Food</h2>
                    <p>Food past its expiry date across your fridge, freezer and pantry.</p>
                  </div>
                  <button
                    type="button"
                    class="modal-close"
                    aria-label="Close expiry panel"
                    @click="closeExpiryPanel"
                  >
                    ✕
                  </button>
                </header>
                <button
                  v-if="expiryItems.length"
                  type="button"
                  class="expiry-button mb-3"
                  :disabled="discardingExpired"
                  @click="discardExpiredFoods"
                >
                  {{ discardingExpired ? 'Discarding…' : 'Discard all expired food' }}
                </button>
                <div v-if="expiryItems.length" class="modal-food-list">
                  <button
                    v-for="item in expiryItems"
                    :key="item.id"
                    type="button"
                    class="expiry-food-row"
                    @click="jumpToItem(item)"
                  >
                    <span class="modal-food-emoji"
                      ><FoodIcon :name="item.name" /><span
                        v-if="Number(item.quantity) > 1"
                        class="food-quantity-badge"
                        >×{{ item.quantity }}</span
                      ></span
                    >
                    <span class="modal-food-info">
                      <strong>{{ item.name }}</strong>
                      <span
                        >{{ itemStorageName(item)
                        }}<template v-if="item.storage !== 'pantry'">
                          · {{ locationLabel(item) }}</template
                        >
                        · {{ amountLabel(item) }}</span
                      >
                    </span>
                    <span class="expiry-label" :class="{ 'is-expired': expiryDays(item) < 0 }">{{
                      expiryLabel(item)
                    }}</span>
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
                <div v-else class="modal-empty">
                  <span>✨</span><strong>No expired food right now</strong>
                  <p>Nothing in your fridge, freezer or pantry is past its expiry date.</p>
                </div>
              </section>
            </div>
          </div>
          <RouterLink :to="{ name: 'scanning' }" class="primary-button"> ＋ Add Food </RouterLink>
        </div>
      </header>

      <nav
        v-if="embedded && storageOptions.length > 1"
        class="dashboard-fridge-switch"
        aria-label="Switch dashboard storage"
      >
        <button
          type="button"
          class="storage-slide-arrow"
          aria-label="Previous storage"
          :disabled="shiftingFood || actionPending"
          @click="stepStorage(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
        </button>
        <span
          :key="currentStorage.label"
          class="dashboard-fridge-name storage-switch-pulse"
          role="status"
          :title="currentStorage.label"
          >{{ currentStorage.label }}</span
        >
        <button
          type="button"
          class="storage-slide-arrow"
          aria-label="Next storage"
          :disabled="shiftingFood || actionPending"
          @click="stepStorage(1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6" /></svg>
        </button>
      </nav>
      <nav v-if="!embedded" class="storage-switcher" aria-label="Storage slideshow">
        <button
          type="button"
          class="storage-slide-arrow"
          aria-label="Previous storage"
          :disabled="shiftingFood || saving"
          @click="stepStorage(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
        </button>
        <div class="storage-slide-options fridge-switcher-options">
          <button
            v-for="(option, index) in storageOptions"
            :key="option.type + ':' + option.name"
            type="button"
            :disabled="shiftingFood || saving"
            :aria-pressed="storageIndex === index"
            @click="selectStorage(option)"
          >
            {{ option.label }}
          </button>
          <span :key="storageIndex" class="storage-slide-status storage-switch-pulse" role="status"
            >{{ storageIndex + 1 }} / {{ storageOptions.length }}</span
          >
        </div>
        <button
          type="button"
          class="storage-slide-arrow"
          aria-label="Next storage"
          :disabled="shiftingFood || saving"
          @click="stepStorage(1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6" /></svg>
        </button>
      </nav>
      <section
        ref="kitchenStage"
        class="kitchen-stage storage-slideshow"
        :class="{ 'instant-storage-slide': !animateStorageSlide }"
        aria-label="Food storage"
        @pointerdown.capture="beginFoodSelection"
        @click.capture="stopSelectionClick"
        @dblclick.capture="openFoodCompartment"
        @keydown.capture="selectFoodWithKeyboard"
        @dragstart.capture="setStageEmojiDragImage($event)"
        @touchstart.passive="holdFood"
        @touchmove="moveHeldFood"
        @touchend="releaseHeldFood"
        @touchcancel="releaseHeldFood"
        @contextmenu="
          touchDrag && $event.target.closest('[data-food-id]') && $event.preventDefault()
        "
      >
        <div class="carousel-window">
          <div class="carousel-track">
            <!-- Refrigerator unit -->
            <section
              class="storage-unit fridge-unit"
              :class="{ 'slide-active': activeStorage === 'fridge' }"
              :inert="activeStorage !== 'fridge' ? true : undefined"
              :aria-hidden="activeStorage !== 'fridge'"
              aria-label="Refrigerator"
            >
              <div
                class="storage-unit-content"
                :class="{ 'storage-switch-pulse': animateStorageSlide }"
              >
                <div v-if="!embedded" class="unit-top-label">
                  <span>❄️</span> FRESH &amp; CHILLED
                </div>
                <button
                  v-if="fridgeDoorOpen"
                  type="button"
                  class="mobile-fridge-close"
                  @click="toggleDoor"
                >
                  Close fridge
                </button>
                <div
                  class="fridge-body"
                  :class="{
                    'fridge-is-open': fridgeDoorOpen,
                    'door-moving': doorGesture?.moved,
                    'light-on': fridgeLightOn,
                    'fridge-is-idle': embedded && doorAngle === 0 && !doorGesture,
                  }"
                  :style="{ '--door-angle': `${doorAngle}deg`, '--open-progress': doorAngle / 170 }"
                >
                  <div class="fridge-cabinet">
                    <div
                      v-for="side in fridgeLightOn ? ['left', 'right'] : []"
                      :key="side"
                      class="cold-air"
                      :class="`cold-air-${side}`"
                      aria-hidden="true"
                    >
                      <svg
                        v-for="n in 3"
                        :key="n"
                        class="cold-air-puff"
                        :style="{ '--puff-index': n - 1 }"
                        viewBox="0 0 150 100"
                      >
                        <path
                          class="cold-air-cloud"
                          d="M12 63 C-1 52 6 34 22 35 C18 16 45 8 56 25 C69 6 99 15 98 35 C122 24 141 42 130 59 C151 71 133 91 114 82 C95 99 75 89 68 83 C45 97 23 83 28 74 C19 77 12 72 12 63Z"
                        />
                        <path
                          class="cold-air-curl"
                          d="M13 57 H60 C85 57 90 31 73 31 C59 31 59 47 70 47 M27 72 H96 C115 72 119 51 106 49"
                        />
                        <path
                          class="cold-air-spark"
                          d="M119 12 V30 M110 21 H128 M113 15 L125 27 M113 27 L125 15"
                        />
                      </svg>
                      <span
                        v-for="n in 4"
                        :key="'flake-' + n"
                        class="cold-air-flake"
                        :style="{ '--flake-index': n - 1 }"
                        >❄</span
                      >
                    </div>
                    <div class="fridge-interior" :inert="!fridgeDoorOpen">
                      <div class="interior-header">
                        <input
                          v-if="!embedded"
                          ref="fridgeSearch"
                          v-model="searchQuery"
                          class="storage-search"
                          type="search"
                          aria-label="Search fridge food"
                          placeholder="Search food…"
                        />
                        <span v-else>YOUR FRIDGE</span>
                        <button
                          v-if="!embedded"
                          type="button"
                          class="storage-search-clear"
                          :disabled="!searchQuery"
                          @click="clearSearch"
                        >
                          Clear
                        </button>
                        <span class="temperature">❄ 4°C</span>
                      </div>
                      <div class="fridge-compartments">
                        <button
                          type="button"
                          class="compartment freezer-compartment"
                          @wheel="scrollCompartment"
                          data-drop-storage="freezer"
                          data-drop-zone="freezer-main"
                          @click="
                            openCompartment({
                              id: 'freezer',
                              title: 'Freezer',
                              storage: 'freezer',
                              zone: 'freezer-main',
                            })
                          "
                          @dragover.prevent
                          @drop.stop="
                            dropOnArea({ storage: 'freezer', storageZone: 'freezer-main' }, $event)
                          "
                        >
                          <span class="compartment-heading"
                            ><span><FoodIcon kind="ice" /> Freezer</span
                            ><small>{{ countItems('freezer') }} items</small></span
                          >
                          <span class="food-preview">
                            <FoodPreview
                              v-for="item in itemsInZone('freezer', 'freezer-main')"
                              :key="item.id"
                              class="mini-food"
                              :item="item"
                              :selected="selectedFoodIds.has(item.id)"
                              :dragging="draggedItemId === item.id"
                              :highlighted="revealedFoodId === item.id"
                              :expiry="expiryBadge(item)"
                              :storage-warning="Boolean(getRecommendation(item))"
                              :description="foodDescription(item)"
                              @show-name="showFoodName"
                              @hide-name="foodTooltip = null"
                              @drag-start="startDrag"
                              @drag-end="finishDrag"
                            />
                            <span
                              v-if="itemsInZone('freezer', 'freezer-main').length === 0"
                              class="empty-mini"
                              >{{ searchQuery ? 'No matches' : 'Empty' }}</span
                            >
                          </span>
                        </button>

                        <button
                          v-for="compartment in [
                            {
                              id: 'main-fridge',
                              title: 'Shelves',
                              storage: 'fridge',
                              zone: 'middle-shelf',
                              icon: 'milk',
                            },
                          ]"
                          :key="compartment.id"
                          type="button"
                          class="compartment shelf-compartment"
                          @wheel="scrollCompartment"
                          :data-drop-storage="compartment.storage"
                          :data-drop-zone="compartment.zone"
                          @click="openCompartment(compartment)"
                          @dragover.prevent
                          @drop.stop="
                            dropOnArea(
                              { storage: compartment.storage, storageZone: compartment.zone },
                              $event,
                            )
                          "
                        >
                          <span class="compartment-heading"
                            ><span
                              ><FoodIcon :kind="compartment.icon" /> {{ compartment.title }}</span
                            ><small>{{ itemCount(compartment) }} items</small></span
                          >
                          <span class="food-preview">
                            <FoodPreview
                              v-for="item in itemsInZone(compartment.storage, compartment.zone)"
                              :key="item.id"
                              class="mini-food"
                              :item="item"
                              :selected="selectedFoodIds.has(item.id)"
                              :dragging="draggedItemId === item.id"
                              :highlighted="revealedFoodId === item.id"
                              :expiry="expiryBadge(item)"
                              :storage-warning="Boolean(getRecommendation(item))"
                              :description="foodDescription(item)"
                              @show-name="showFoodName"
                              @hide-name="foodTooltip = null"
                              @drag-start="startDrag"
                              @drag-end="finishDrag"
                            />
                            <span
                              v-if="itemsInZone(compartment.storage, compartment.zone).length === 0"
                              class="empty-mini"
                              >{{ searchQuery ? 'No matches' : 'Empty' }}</span
                            >
                          </span>
                        </button>

                        <div class="fridge-bottom">
                          <button
                            type="button"
                            class="compartment crisper-compartment"
                            @wheel="scrollCompartment"
                            data-drop-storage="fridge"
                            data-drop-zone="crisper"
                            @click="
                              openCompartment({
                                id: 'crisper',
                                title: 'Crisper drawer',
                                storage: 'fridge',
                                zone: 'crisper',
                                icon: 'leafy',
                              })
                            "
                            @dragover.prevent
                            @drop.stop="
                              dropOnArea({ storage: 'fridge', storageZone: 'crisper' }, $event)
                            "
                          >
                            <span class="compartment-heading"
                              ><span><FoodIcon kind="leafy" /> Crisper drawer</span>
                              <small
                                >{{ itemsInZone('fridge', 'crisper').length }} items</small
                              ></span
                            >
                            <span class="food-preview">
                              <FoodPreview
                                v-for="item in itemsInZone('fridge', 'crisper')"
                                :key="item.id"
                                class="mini-food"
                                :item="item"
                                :selected="selectedFoodIds.has(item.id)"
                                :dragging="draggedItemId === item.id"
                                :highlighted="revealedFoodId === item.id"
                                :expiry="expiryBadge(item)"
                                :storage-warning="Boolean(getRecommendation(item))"
                                :description="foodDescription(item)"
                                @show-name="showFoodName"
                                @hide-name="foodTooltip = null"
                                @drag-start="startDrag"
                                @drag-end="finishDrag"
                              />
                              <span
                                v-if="itemsInZone('fridge', 'crisper').length === 0"
                                class="empty-mini"
                                >{{ searchQuery ? 'No matches' : 'Empty' }}</span
                              >
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div
                      class="fridge-door"
                      :class="{ 'door-open': fridgeDoorOpen }"
                      role="button"
                      tabindex="0"
                      :aria-expanded="fridgeDoorOpen"
                      :aria-label="
                        fridgeDoorOpen ? 'Close refrigerator door' : 'Open refrigerator door'
                      "
                      @click="toggleDoor"
                      @pointerdown="startDoorGesture"
                      @pointermove="moveDoorGesture"
                      @pointerup="endDoorGesture"
                      @pointercancel="endDoorGesture($event, true)"
                      @lostpointercapture="endDoorGesture($event, true)"
                      @keydown.enter.self.prevent="toggleDoor"
                      @keydown.space.self.prevent="toggleDoor"
                    >
                      <span class="door-brand" :title="fridgeDoorTitle">{{ fridgeDoorTitle }}</span>
                      <span
                        v-if="!fridgeDoorOpen"
                        class="closed-fridge-dashboard"
                        aria-label="Fridge inventory summary"
                      >
                        <span class="dashboard-title">FRIDGE STATUS</span>
                        <span class="dashboard-stat"
                          ><strong>{{ totalItems }}</strong
                          ><small>Total tracked</small></span
                        >
                        <span class="dashboard-stat"
                          ><strong>{{ countItems('fridge') + countItems('freezer') }}</strong
                          ><small>Fridge &amp; freezer</small></span
                        >
                        <span class="dashboard-stat dashboard-expired"
                          ><strong>{{ expiredCount }}</strong
                          ><small>Expired</small></span
                        >
                        <span class="dashboard-stat dashboard-soon"
                          ><strong>{{ expiringSoonCount }}</strong
                          ><small>Expiring soon</small></span
                        >
                      </span>
                      <span class="door-handle"></span>
                      <span class="door-hint">{{
                        fridgeDoorOpen ? 'DOOR OPEN' : 'OPEN FRIDGE'
                      }}</span>
                      <span class="door-inner" :inert="!fridgeDoorOpen">
                        <span class="door-inner-title">DOOR SHELVES</span>
                        <span
                          class="door-bin"
                          @wheel="scrollCompartment"
                          data-drop-storage="fridge"
                          data-drop-zone="door"
                          role="button"
                          tabindex="0"
                          aria-label="Upper door shelf"
                          @dragover.prevent
                          @drop.stop="
                            dropOnArea({ storage: 'fridge', storageZone: 'door' }, $event)
                          "
                          @click.stop="
                            openCompartment({
                              id: 'door',
                              title: 'Upper door shelf',
                              storage: 'fridge',
                              zone: 'door',
                            })
                          "
                          @keydown.enter.stop="
                            openCompartment({
                              id: 'door',
                              title: 'Upper door shelf',
                              storage: 'fridge',
                              zone: 'door',
                            })
                          "
                          @keydown.space.prevent.stop="
                            openCompartment({
                              id: 'door',
                              title: 'Upper door shelf',
                              storage: 'fridge',
                              zone: 'door',
                            })
                          "
                        >
                          <FoodPreview
                            v-for="item in itemsInZone('fridge', 'door')"
                            :key="item.id"
                            class="door-food"
                            :item="item"
                            :selected="selectedFoodIds.has(item.id)"
                            :dragging="draggedItemId === item.id"
                            :highlighted="revealedFoodId === item.id"
                            :expiry="expiryBadge(item)"
                            :storage-warning="Boolean(getRecommendation(item))"
                            :description="foodDescription(item)"
                            @show-name="showFoodName"
                            @hide-name="foodTooltip = null"
                            @drag-start="startDrag"
                            @drag-end="finishDrag"
                          />
                          <span
                            v-if="itemsInZone('fridge', 'door').length === 0"
                            class="door-empty"
                            >{{ searchQuery ? 'No matches' : 'Empty shelf' }}</span
                          >
                        </span>
                        <span
                          class="door-bin door-bin-small"
                          @wheel="scrollCompartment"
                          data-drop-storage="fridge"
                          data-drop-zone="door-lower"
                          role="button"
                          tabindex="0"
                          aria-label="Lower door shelf"
                          @dragover.prevent
                          @drop.stop="
                            dropOnArea({ storage: 'fridge', storageZone: 'door-lower' }, $event)
                          "
                          @click.stop="
                            openCompartment({
                              id: 'door-lower',
                              title: 'Lower door shelf',
                              storage: 'fridge',
                              zone: 'door-lower',
                            })
                          "
                          @keydown.enter.stop="
                            openCompartment({
                              id: 'door-lower',
                              title: 'Lower door shelf',
                              storage: 'fridge',
                              zone: 'door-lower',
                            })
                          "
                          @keydown.space.prevent.stop="
                            openCompartment({
                              id: 'door-lower',
                              title: 'Lower door shelf',
                              storage: 'fridge',
                              zone: 'door-lower',
                            })
                          "
                        >
                          <FoodPreview
                            v-for="item in itemsInZone('fridge', 'door-lower')"
                            :key="item.id"
                            class="door-food"
                            :item="item"
                            :selected="selectedFoodIds.has(item.id)"
                            :dragging="draggedItemId === item.id"
                            :highlighted="revealedFoodId === item.id"
                            :expiry="expiryBadge(item)"
                            :storage-warning="Boolean(getRecommendation(item))"
                            :description="foodDescription(item)"
                            @show-name="showFoodName"
                            @hide-name="foodTooltip = null"
                            @drag-start="startDrag"
                            @drag-end="finishDrag"
                          />
                          <span
                            v-if="itemsInZone('fridge', 'door-lower').length === 0"
                            class="door-empty"
                            >{{ searchQuery ? 'No matches' : 'Empty shelf' }}</span
                          >
                        </span>
                        <span
                          v-if="fridgeDoorOpen"
                          class="fridge-close-button"
                          role="button"
                          tabindex="0"
                          aria-label="Close refrigerator door"
                          @click.stop="fridgeDoorOpen = false"
                          @keydown.enter.stop="fridgeDoorOpen = false"
                          @keydown.space.prevent.stop="fridgeDoorOpen = false"
                          >✕ Close door</span
                        >
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Pantry unit -->
            <section
              v-if="!embedded || activeStorage === 'pantry'"
              class="storage-unit pantry-unit"
              :class="{ 'slide-active': activeStorage === 'pantry' }"
              :inert="activeStorage !== 'pantry' ? true : undefined"
              :aria-hidden="activeStorage !== 'pantry'"
              aria-label="Pantry"
            >
              <input
                v-if="!embedded && activeStorage === 'pantry'"
                v-model="searchQuery"
                class="storage-search pantry-search"
                type="search"
                aria-label="Search pantry food"
                placeholder="Search food…"
              />
              <div
                class="storage-unit-content"
                :class="{ 'storage-switch-pulse': animateStorageSlide }"
              >
                <div class="unit-top-label pantry-label">
                  {{ countItems('pantry') }} pantry items · Four open shelves
                </div>
                <div class="pantry-cabinet pantry-single-storage open-pantry">
                  <div class="open-pantry-shelves">
                    <button
                      v-for="(shelf, index) in pantryShelves"
                      :key="index"
                      type="button"
                      class="pantry-shelf pantry-whole-storage"
                      :aria-label="`Pantry shelf ${index + 1}, ${shelf.length} foods. View pantry items`"
                      @wheel="scrollCompartment"
                      data-drop-storage="pantry"
                      data-drop-zone="dry-storage"
                      @click="
                        openCompartment({
                          id: 'pantry',
                          title: 'Pantry',
                          storage: 'pantry',
                          zone: 'dry-storage',
                        })
                      "
                      @dragover.prevent
                      @drop.stop="
                        dropOnArea({ storage: 'pantry', storageZone: 'dry-storage' }, $event)
                      "
                    >
                      <span class="pantry-foods pantry-all-foods">
                        <FoodPreview
                          v-for="item in shelf"
                          :key="item.id"
                          class="mini-food"
                          :item="item"
                          :selected="selectedFoodIds.has(item.id)"
                          :dragging="draggedItemId === item.id"
                          :highlighted="revealedFoodId === item.id"
                          :expiry="expiryBadge(item)"
                          :storage-warning="Boolean(getRecommendation(item))"
                          :description="foodDescription(item)"
                          @show-name="showFoodName"
                          @hide-name="foodTooltip = null"
                          @drag-start="startDrag"
                          @drag-end="finishDrag"
                        />
                      </span>
                    </button>
                  </div>
                </div>
                <p class="unit-caption">
                  {{
                    searchQuery && !pantryShelves.some((shelf) => shelf.length)
                      ? 'No pantry foods match your search.'
                      : 'Click a shelf to view pantry items · Drag empty space to select foods'
                  }}
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section v-if="!embedded" class="storage-hint">
        <span><NoticeIcon name="sparkle" /></span>
        <p>
          <strong>Tip:</strong> Food closest to its expiry date appears first. Click any shelf or
          drawer to see its complete inventory, then drag an item to Consume or Discard.
        </p>
      </section>

      <section v-if="!embedded" class="recommendation-section">
        <div class="recommendation-heading">
          <h2>Storage Guidance</h2>
          <div class="guidance-heading-actions">
            <button
              type="button"
              class="guidance-arrange-all"
              title="Arrange the items shown below"
              :disabled="guidanceBusy || !arrangeableFoods.length"
              @click="confirmArrangeAll"
            >
              {{ arrangingFoodIds.size ? 'Arranging…' : 'Arrange all' }}
            </button>
            <button
              type="button"
              class="guidance-ignore guidance-ignore-all"
              :disabled="guidanceBusy || !storageRecommendations.length"
              @click="ignoreAllGuidance"
            >
              Ignore all
            </button>
          </div>
        </div>
        <p>
          Some foods may need a different storage location. Check product packaging and
          food-specific guidance.
        </p>
        <p>
          Guidance uses the food name and category. Include “opened”, “cooked”, “cut” or “frozen” in
          the name when relevant, and follow the product label.
        </p>
        <p v-if="arrangementError" class="guidance-error" role="alert">{{ arrangementError }}</p>
        <TransitionGroup
          name="guidance-list"
          tag="div"
          class="recommendation-list"
          tabindex="0"
          role="region"
          aria-label="Storage guidance items"
        >
          <article
            v-for="item in storageRecommendations"
            :key="item.id"
            class="recommendation-card"
          >
            <span><NoticeIcon name="sparkle" /></span>
            <div class="recommendation-copy">
              <strong>{{ item.name }}</strong>
              <p>{{ getRecommendation(item) }}</p>
              <p v-if="guidanceDestination(item)" class="guidance-destination">
                Move to {{ guidanceDestinationLabel(item) }}
              </p>
            </div>
            <div class="guidance-item-actions">
              <button
                type="button"
                class="guidance-ignore"
                :aria-label="`Ignore storage guidance for ${item.name}`"
                :disabled="guidanceBusy"
                @click="setGuidanceIgnored(item, true)"
              >
                Ignore
              </button>
              <button
                type="button"
                class="guidance-arrange"
                :aria-label="`Arrange ${item.name}`"
                :disabled="guidanceBusy || !guidanceDestination(item)"
                @click="arrangeGuidance([item])"
              >
                {{ arrangingFoodIds.has(item.id) ? 'Arranging…' : 'Arrange' }}
              </button>
            </div>
          </article>
        </TransitionGroup>
        <p v-if="storageRecommendations.length === 0" class="no-recommendations">
          No basic storage suggestions for the current search.
        </p>
        <details v-if="ignoredStorageRecommendations.length" class="ignored-guidance">
          <summary>Ignored guidance ({{ ignoredStorageRecommendations.length }})</summary>
          <div
            v-for="item in ignoredStorageRecommendations"
            :key="item.id"
            class="ignored-guidance-row"
          >
            <span>{{ item.name }}</span>
            <button
              type="button"
              class="guidance-ignore"
              :aria-label="`Restore storage guidance for ${item.name}`"
              :disabled="guidanceBusy"
              @click="setGuidanceIgnored(item, false)"
            >
              Restore
            </button>
          </div>
        </details>
      </section>

      <!-- Full compartment inventory -->
      <div
        v-if="selectedCompartment"
        class="modal-backdrop"
        :class="{ 'dragging-out': draggingOutsideModal }"
        @click.self="closeCompartment"
        @dragover.prevent="updateModalDragVisibility($event)"
        @drop.prevent="dropFromModalBackdrop($event)"
      >
        <section
          ref="dialogRef"
          class="inventory-modal"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          aria-labelledby="compartment-title"
          @keydown="handleDialogKeydown"
        >
          <header class="modal-heading">
            <span class="compartment-modal-icon" aria-hidden="true"
              ><FoodIcon
                :kind="
                  selectedCompartment.icon ||
                  (selectedCompartment.storage === 'freezer'
                    ? 'ice'
                    : selectedCompartment.storage === 'pantry'
                      ? 'can'
                      : selectedCompartment.zone === 'crisper'
                        ? 'leafy'
                        : 'milk')
                "
            /></span>
            <div class="compartment-modal-title">
              <p class="eyebrow">{{ currentStorage?.label }} · YOUR INVENTORY</p>
              <h2 id="compartment-title">{{ selectedCompartment.title }}</h2>
              <p>A little organisation. A lot less waste.</p>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Close compartment"
              @click="closeCompartment"
            >
              ✕
            </button>
          </header>
          <div class="compartment-summary" aria-label="Compartment summary">
            <span class="compartment-count"
              >{{ compartmentItems.length }} {{ compartmentItems.length === 1 ? 'food' : 'foods'
              }}{{ searchQuery ? ' found' : '' }}</span
            >
            <span v-if="compartmentStatus.expired" class="compartment-expired"
              ><NoticeIcon name="bell" /> {{ compartmentStatus.expired }} expired</span
            >
            <span v-if="compartmentStatus.soon" class="compartment-soon"
              ><NoticeIcon name="clock" /> {{ compartmentStatus.soon }} use soon</span
            >
            <span class="compartment-sort"><NoticeIcon name="clock" /> Expiring first</span>
          </div>
          <div class="modal-toolbar">
            <label class="compartment-search"
              ><svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="6" />
                <path d="m15 15 5 5" /></svg
              ><input
                v-model="searchQuery"
                type="search"
                aria-label="Search compartment food"
                placeholder="Find food in this compartment…"
            /></label>
            <RouterLink
              v-if="!embedded"
              :to="{ name: 'scanning' }"
              class="primary-button small-button"
              >＋ Scan to add food</RouterLink
            >
          </div>
          <p v-if="errorMessage" class="compartment-error" role="alert">{{ errorMessage }}</p>
          <div v-if="compartmentItems.length" class="modal-food-list">
            <FoodItemCard
              v-for="item in compartmentItems"
              :key="item.id"
              :item="item"
              :amount="amountLabel(item)"
              :diet-label="dietTypeLabel(item.dietType)"
              :storage-warning="getRecommendation(item)"
              :storage-options="otherStorageOptions(item)"
              :busy="shiftingFood || actionPending || saving"
              :dragging="draggedItemId === item.id"
              @edit="openEditForm"
              @remove="removeItem"
              @consume="runCardAction($event, 'consume')"
              @discard="runCardAction($event, 'discard')"
              @move-storage="moveToStorage"
              @reveal="jumpToItem"
              @drag-start="startModalDrag"
              @drag-end="finishDrag"
            />
          </div>
          <div v-else class="modal-empty">
            <span>{{ searchQuery ? '🔎' : '🧺' }}</span
            ><strong>{{
              searchQuery ? 'No foods match this search' : 'This compartment is empty'
            }}</strong>
            <p>
              {{
                searchQuery
                  ? 'Try a different food name, unit, or location.'
                  : 'Add food to see it here.'
              }}
            </p>
          </div>
          <p class="modal-footnote">
            Drag food to move it, or use the buttons to consume, discard and organise.
          </p>
        </section>
      </div>

      <FoodDragActions
        :visible="
          Boolean(draggedItemId) || (actionPending && !cardActionPending) || Boolean(actionReaction)
        "
        :storage-action="storageAction"
        :position="dragPosition"
        :anchor="dragAnchor"
        :reaction="actionReaction"
        :pending="actionPending"
        @action-drop="dropOnAction"
      />
      <FoodTransferOverlay
        :flights="foodTransfer.flights.value"
        :announcement="foodTransfer.announcement.value"
        @complete="foodTransfer.finish"
      />
      <Teleport to="body">
        <aside
          v-if="movedStorageWarnings.length"
          class="storage-move-warning"
          role="alert"
          aria-label="Storage guidance after moving food"
        >
          <div class="storage-move-warning-heading">
            <strong><NoticeIcon name="bell" /> Check the new storage location</strong>
            <button
              type="button"
              aria-label="Dismiss storage guidance prompt"
              @click="movedStorageAdviceIds = []"
            >
              ✕
            </button>
          </div>
          <ul>
            <li v-for="item in movedStorageWarnings" :key="item.id">
              {{ getRecommendation(item) }}
            </li>
          </ul>
        </aside>
        <div
          v-if="selectionBox"
          class="food-selection-box"
          aria-hidden="true"
          :style="{
            left: selectionBox.left + 'px',
            top: selectionBox.top + 'px',
            width: selectionBox.right - selectionBox.left + 'px',
            height: selectionBox.bottom - selectionBox.top + 'px',
          }"
        ></div>
        <div v-if="selectedFoodIds.size" class="food-selection-count" role="status">
          {{ selectedFoodIds.size }} selected · Drag a highlighted food to move the group · Esc to
          clear
        </div>
        <EggLoader :visible="shiftingFood" label="Shifting food" />
        <span
          v-if="dragPlacement && dragPosition"
          class="drag-placement-hint"
          role="status"
          :style="{
            left: `${Math.max(95, Math.min(dragPosition.x, windowWidth - 95))}px`,
            top: `${Math.max(12, dragPosition.y - 72)}px`,
          }"
          >Place at {{ dragPlacement }}</span
        >
        <div
          v-if="draggedFood && dragPosition"
          class="held-food"
          aria-hidden="true"
          :style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px` }"
        >
          <span v-if="selectedFoodIds.size > 1" class="drag-group-count"
            >{{ selectedFoodIds.size }} foods</span
          ><FoodIcon :item="draggedFood" /><span
            v-if="Number(draggedFood.quantity) > 1"
            class="food-quantity-badge"
            >×{{ draggedFood.quantity }}</span
          >
        </div>
      </Teleport>

      <FoodItemForm
        :visible="formVisible"
        :item="editingItem"
        :default-storage="defaultStorage"
        :default-storage-zone="defaultStorageZone"
        :saving="saving"
        @save="saveItem"
        @close="closeForm"
      />

      <footer v-if="!embedded" class="page-footer">
        <p>Full Circle · Interactive Smart Fridge</p>
        <p>Your inventory is loaded from and saved to the backend.</p>
      </footer>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="foodTooltip"
      role="tooltip"
      class="fridge-food-tooltip"
      :style="{ left: foodTooltip.x + 'px', top: foodTooltip.y + 'px' }"
    >
      <span class="food-tooltip-name">{{ foodTooltip.name }}</span>
      <span v-if="foodTooltip.storageWarning" class="food-tooltip-storage">{{
        foodTooltip.storageWarning
      }}</span>
      <span
        v-if="foodTooltip.expiry"
        class="food-tooltip-expiry"
        :class="{ expired: foodTooltip.expired }"
        >{{ foodTooltip.expiry }}</span
      >
    </div>
  </Teleport>
</template>

<style scoped src="../../styles/fridge/fridge.css"></style>
