import { cardLibrary } from "./cardLibrary.js"
const voiceList = [
  "cgSgspJ2msm6clMCkdW9", // Jessica
  "FGY2WhTYpPnrIDTdsKH5", // Laura
  "EXAVITQu4vr4xnSDxMaL", // Sarah
  "hpp4J3VqNfWAUOO0d1Us", // Bella
  "XrExE9yKIg1WjnnlVkGX", // Matilda
  "SAz9YHcvj6GT2YYXdXww", // River
  "iP95p4xoKVk53GoZ742B", // Chris
  "TX3LPaxmHKxFdv7VOQHJ", // Liam
  "nPczCjzI2devNBz1zQrb", // Brian
  "pqHfZKP75CvOlQylNhV4", // Bill
  "bIHbv24MWmeRgasZH58o", // Will
  "pNInz6obpgDQGcFmaJgB", // Adam
  "CwhRBWXzGAHq8TQ4Fs17"  // Roger
]

const gameBoard = document.getElementById("game-board")
const pairsInput = document.getElementById("pairs-input")
const resetButton = document.getElementById("reset-button")
const triesDisplay = document.getElementById("tries-display")
const activeUnitsLabel = document.getElementById("active-units-label")

resetButton.addEventListener("click", () => {
  resetGame()
  enablePlayerDragging()
})

let activeCardAudio = null
let activeUnits = []
let combinedUnitItems = []
let currentBook = null
let currentSeries = null
let currentPlayerIndex = 0
let isDraggingEnabled = false
let keepTurnOnMatch = true
let firstSelected = null
let currentTurnCardClicked = false
let playingTurnAudio = null
let playingKeepGoingAudio = null
let isNarratorEnabled = true
const savedNarratorEnabled = localStorage.getItem("elevenlabs_narrator_enabled")
if (savedNarratorEnabled !== null) {
  isNarratorEnabled = JSON.parse(savedNarratorEnabled)
}
let images = []
let lockBoard = false
let matchedPairs = 0
let maxPairs = 8
let minPairs = 2
let numPairs = 0
let players = []
let playerStats = {
  sessionData: {
    lastUpdated: null,
    players: [],
  },
  players: {},
}
let selectedWords = []
let soundMap = {}
let targetLetters = null
let tries = 0
let usedMatchColors = []
let words = []

// Shared player sets and active session keys
const SHARED_SETS_KEY = "shared_player_sets"
const OLD_SETS_KEY = "phonics_player_sets"
const SHARED_ACTIVE_PLAYERS_KEY = "shared_active_players"
const UPSTASH_URL_KEY = "upstash_redis_url"
const UPSTASH_TOKEN_KEY = "upstash_redis_token"

// Get Upstash Redis credentials from localStorage, cleaning the URL
function getUpstashCredentials() {
  let url = localStorage.getItem(UPSTASH_URL_KEY)
  const token = localStorage.getItem(UPSTASH_TOKEN_KEY)
  if (url && url.endsWith("/")) {
    url = url.slice(0, -1)
  }
  return { url, token }
}

// Get all saved player sets
function getPlayerSets() {
  const setsJSON = localStorage.getItem(SHARED_SETS_KEY) || localStorage.getItem(OLD_SETS_KEY)
  return setsJSON ? JSON.parse(setsJSON) : {}
}

// Save player sets locally and sync to Upstash
function savePlayerSets(sets) {
  localStorage.setItem(SHARED_SETS_KEY, JSON.stringify(sets))
  syncToUpstash(SHARED_SETS_KEY, sets)
}

// Save active session players locally and sync to Upstash
function saveActiveSessionPlayers(namesArray) {
  localStorage.setItem(SHARED_ACTIVE_PLAYERS_KEY, JSON.stringify(namesArray))
  syncToUpstash(SHARED_ACTIVE_PLAYERS_KEY, namesArray)
  
  const playerNameInput = document.getElementById("player-names-input")
  if (playerNameInput) {
    playerNameInput.value = namesArray.join(", ")
  }
}

function handleUpstashError(errorMessage) {
  localStorage.removeItem(UPSTASH_URL_KEY)
  localStorage.removeItem(UPSTASH_TOKEN_KEY)
  
  const statusEl = document.getElementById("sync-status")
  const syncSummary = document.getElementById("sync-settings-summary")
  const syncDetails = document.getElementById("sync-settings-details")
  
  if (statusEl) {
    statusEl.textContent = errorMessage || "Sync credentials invalid. Cleared."
    statusEl.className = "api-key-status error"
  }
  if (syncSummary) {
    syncSummary.textContent = "Upstash Redis Config (Error)"
  }
  if (syncDetails) {
    syncDetails.open = true
  }
}

// Helper to push a key-value pair to Upstash Redis
async function syncToUpstash(key, data) {
  const { url, token } = getUpstashCredentials()
  if (!url || !token) return

  try {
    const response = await fetch(`${url}/set/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      console.error(`Upstash Sync failed for ${key}:`, response.statusText)
      if (response.status === 401 || response.status === 403) {
        handleUpstashError("Upstash token is invalid or expired. Disconnected.")
      }
    }
  } catch (error) {
    console.error(`Upstash Sync error for ${key}:`, error)
  }
}

// Fetch a single key from Upstash Redis
async function fetchFromUpstash(key) {
  const { url, token } = getUpstashCredentials()
  if (!url || !token) return null

  try {
    const response = await fetch(`${url}/get/${key}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (response.ok) {
      const resData = await response.json()
      if (resData && resData.result !== undefined && resData.result !== null) {
        return JSON.parse(resData.result)
      }
    } else {
      console.error(`Upstash fetch failed for ${key}:`, response.statusText)
      if (response.status === 401 || response.status === 403) {
        handleUpstashError("Upstash token is invalid or expired. Disconnected.")
      }
    }
  } catch (error) {
    console.error(`Upstash fetch error for ${key}:`, error)
  }
  return null;
}

// Perform full sync (pull database updates and merge/overwrite local storage)
async function syncWithUpstashOnLoad() {
  const { url, token } = getUpstashCredentials()
  if (!url || !token) return

  const statusEl = document.getElementById("sync-status")
  const syncSummary = document.getElementById("sync-settings-summary")
  if (statusEl) {
    statusEl.textContent = "Syncing..."
    statusEl.className = "api-key-status"
  }

  try {
    // 1. Sync sets (Database is source of truth if it exists)
    const dbSets = await fetchFromUpstash(SHARED_SETS_KEY)
    if (!localStorage.getItem(UPSTASH_URL_KEY)) return

    if (dbSets) {
      localStorage.setItem(SHARED_SETS_KEY, JSON.stringify(dbSets))
      populatePlayerSetSelect()
    } else {
      // If cloud is empty but we have local sets, initialize the cloud
      const localSets = getPlayerSets()
      if (Object.keys(localSets).length > 0) {
        await syncToUpstash(SHARED_SETS_KEY, localSets)
      }
    }

    // 2. Sync active session (Database is source of truth if it exists)
    const dbActive = await fetchFromUpstash(SHARED_ACTIVE_PLAYERS_KEY)
    if (!localStorage.getItem(UPSTASH_URL_KEY)) return

    if (dbActive && Array.isArray(dbActive)) {
      localStorage.setItem(SHARED_ACTIVE_PLAYERS_KEY, JSON.stringify(dbActive))
      loadSavedPlayerNames()
    } else {
      // If cloud is empty but we have local active players, initialize the cloud
      const localActiveJSON = localStorage.getItem(SHARED_ACTIVE_PLAYERS_KEY)
      if (localActiveJSON) {
        try {
          const localActive = JSON.parse(localActiveJSON)
          if (Array.isArray(localActive) && localActive.length > 0) {
            await syncToUpstash(SHARED_ACTIVE_PLAYERS_KEY, localActive)
          }
        } catch (e) {
          console.error(e)
        }
      }
    }

    if (statusEl) {
      statusEl.textContent = "Synced successfully!"
      statusEl.className = "api-key-status success"
    }
    if (syncSummary) {
      syncSummary.textContent = "Upstash Redis Config (Connected)"
    }
  } catch (err) {
    console.error("Error running onload sync:", err)
    if (statusEl) {
      statusEl.textContent = "Sync failed."
      statusEl.className = "api-key-status error"
    }
    if (syncSummary) {
      syncSummary.textContent = "Upstash Redis Config (Error)"
    }
  }
}

function populatePlayerSetSelect() {
  const select = document.getElementById("player-set-select")
  const deleteBtn = document.getElementById("delete-set-btn")
  if (!select) return

  select.innerHTML = '<option value="">-- Load Saved List --</option>'

  const sets = getPlayerSets()
  Object.keys(sets).sort().forEach((setName) => {
    const opt = document.createElement("option")
    opt.value = setName
    opt.textContent = setName
    select.appendChild(opt)
  })

  if (deleteBtn) deleteBtn.style.display = "none"
}

// Preload sound files
const matchSound = preloadSingleSound("data/soundfx/match-sound.mp3")
const completeSound = preloadSingleSound("data/soundfx/complete-sound.mp3")
const wrongSound = preloadSingleSound("data/soundfx/wrong-sound.mp3")

// Function to preload audio
function preloadSoundsArray(items) {
  return items
    .filter((item) => item.sound)
    .reduce((acc, item) => {
      // Preload the regular sound
      const audio = new Audio()
      audio.preload = "auto"
      audio.src = item.sound
      acc[item.word] = audio

      // Preload the image sound for Book1
      if (item.imageSound) {
        const imgAudio = new Audio()
        imgAudio.preload = "auto"
        imgAudio.src = item.imageSound
        acc[item.image] = imgAudio
      }

      return acc
    }, {})
}

function preloadSingleSound(src) {
  const audio = new Audio()
  audio.preload = "auto"
  audio.src = src
  return audio
}

function playSound(sound) {
  return new Promise((resolve) => {
    const onEnded = () => {
      sound.removeEventListener("interrupted", onInterrupted)
      resolve()
    }
    const onInterrupted = () => {
      sound.removeEventListener("ended", onEnded)
      resolve()
    }
    sound.addEventListener("ended", onEnded, { once: true })
    sound.addEventListener("interrupted", onInterrupted, { once: true })
    sound.play().catch((error) => {
      console.error("Error playing sound:", error)
      sound.removeEventListener("ended", onEnded)
      sound.removeEventListener("interrupted", onInterrupted)
      resolve() // Resolve even on error to prevent hanging
    })
  })
}

function getRandomMatchColor() {
  const matchColors = [
    "matched-1",
    "matched-2",
    "matched-3",
    "matched-4",
    "matched-5",
    "matched-6",
    "matched-7",
    "matched-8",
  ]

  // If all colors have been used, reset the available colors
  if (usedMatchColors.length === matchColors.length) {
    usedMatchColors = []
  }

  // Filter out already used colors
  const availableColors = matchColors.filter(
    (color) => !usedMatchColors.includes(color)
  )

  // Select a random color from available colors
  const randomIndex = Math.floor(Math.random() * availableColors.length)
  const selectedColor = availableColors[randomIndex]

  // Mark the color as used
  usedMatchColors.push(selectedColor)

  return selectedColor
}

function initializePlayerStats() {
  const saved = localStorage.getItem("matchingGamePlayerStats")
  if (saved) {
    playerStats = JSON.parse(saved)
    checkSessionExpiry()
  }

  playerStats.sessionData = {
    lastUpdated: Date.now(),
    players: players.map((p) => p.name),
  }

  players.forEach((player) => {
    if (!playerStats.players[player.name]) {
      playerStats.players[player.name] = {
        allTime: {
          gamesPlayed: 0,
          gamesWon: 0,
          totalMatchesFound: 0,
        },
        session: {
          sessionGamesWon: 0,
          sessionMatchesFound: 0,
        },
        headToHead: {},
      }
    }

    players.forEach((opponent) => {
      if (player.name !== opponent.name) {
        playerStats.players[player.name].headToHead[opponent.name] =
          playerStats.players[player.name].headToHead[opponent.name] || 0
      }
    })
  })

  savePlayerStats()
}

function checkSessionExpiry() {
  const thirtyMinutes = 30 * 60 * 1000
  const now = Date.now()

  let shouldResetSession = false

  // console.log("Last updated:", playerStats.sessionData.lastUpdated)
  // console.log("Current time:", now)
  // console.log("Difference:", now - playerStats.sessionData.lastUpdated)

  // Check if session is expired
  if (now - playerStats.sessionData.lastUpdated > thirtyMinutes) {
    console.log("Session expired due to time")
    shouldResetSession = true
  }

  // Check if player list changed
  const currentPlayers = players.map((p) => p.name).sort()
  const storedPlayers = [...playerStats.sessionData.players].sort()

  if (JSON.stringify(currentPlayers) !== JSON.stringify(storedPlayers)) {
    shouldResetSession = true
  }

  if (shouldResetSession) {
    resetSessionStats()
  }
}

function resetSessionStats() {
  playerStats.sessionData = {
    lastUpdated: Date.now(),
    players: players.map((p) => p.name),
  }

  Object.keys(playerStats.players).forEach((playerName) => {
    playerStats.players[playerName].session = {
      sessionGamesWon: 0,
      sessionMatchesFound: 0,
    }
  })

  savePlayerStats()
}

function savePlayerStats() {
  playerStats.sessionData.lastUpdated = Date.now()
  localStorage.setItem("matchingGamePlayerStats", JSON.stringify(playerStats))
}

function updateStatsForMatch(playerName) {
  const player = playerStats.players[playerName]
  if (player) {
    player.allTime.totalMatchesFound++
    player.session.sessionMatchesFound++
  }
}

function updateStatsAfterWin(highestScore) {
  // Get all winners in an array
  const winners = players.filter((player) => player.score === highestScore)

  // Update games played for all players
  players.forEach((player) => {
    if (playerStats.players[player.name]) {
      playerStats.players[player.name].allTime.gamesPlayed++
    }
  })

  // Update winner stats
  winners.forEach((winner) => {
    if (playerStats.players[winner.name]) {
      const winnerStats = playerStats.players[winner.name]
      winnerStats.allTime.gamesWon++
      winnerStats.session.sessionGamesWon++

      // Update head-to-head records
      players.forEach((player) => {
        if (player.name !== winner.name) {
          winnerStats.headToHead[player.name] =
            (winnerStats.headToHead[player.name] || 0) + 1
        }
      })
    }
  })

  savePlayerStats()
}

// Player reordering functions
function shufflePlayers() {
  if (players.length < 2) return

  const originalOrder = [...players]
  let maxAttempts = 100
  let validShuffle = false

  while (!validShuffle && maxAttempts > 0) {
    // Perform shuffle
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[players[i], players[j]] = [players[j], players[i]]
    }

    // Check that the entire order is not identical to the original
    validShuffle = players.some(
      (player, index) => player !== originalOrder[index]
    )
    maxAttempts--
  }

  updatePlayerScores()
  saveActiveSessionPlayers(players.map((p) => p.name))
}

function enablePlayerDragging() {
  if (players.length < 2) return

  isDraggingEnabled = true
  const scoresDiv = document.getElementById("player-scores")
  const shuffleBtn = document.getElementById("shuffle-btn")
  if (shuffleBtn) shuffleBtn.style.display = "inline-block"
  const dragBtn = document.getElementById("drag-btn")
  if (dragBtn) dragBtn.style.display = "inline-block"

  scoresDiv.querySelectorAll(".player-card").forEach((div) => {
    div.draggable = true
    div.classList.add("draggable")

    const handle = div.querySelector(".drag-handle")
    if (handle) handle.style.display = "inline-block"

    div.addEventListener("dragstart", handleDragStart)
    div.addEventListener("dragover", handleDragOver)
    div.addEventListener("dragenter", handleDragEnter)
    div.addEventListener("dragleave", handleDragLeave)
    div.addEventListener("dragend", handleDragEnd)
    div.addEventListener("drop", handleDrop)
  })
}

function disablePlayerDragging(shouldAnnounce = true) {
  isDraggingEnabled = false
  const scoresDiv = document.getElementById("player-scores")
  const shuffleBtn = document.getElementById("shuffle-btn")
  if (shuffleBtn) shuffleBtn.style.display = "none"
  const dragBtn = document.getElementById("drag-btn")
  if (dragBtn) dragBtn.style.display = "none"

  scoresDiv.querySelectorAll(".player-card").forEach((div) => {
    div.draggable = false
    div.classList.remove("draggable")

    const handle = div.querySelector(".drag-handle")
    if (handle) handle.style.display = "none"

    div.removeEventListener("dragstart", handleDragStart)
    div.removeEventListener("dragover", handleDragOver)
    div.removeEventListener("dragenter", handleDragEnter)
    div.removeEventListener("dragleave", handleDragLeave)
    div.removeEventListener("dragend", handleDragEnd)
    div.removeEventListener("drop", handleDrop)
  })
  if (shouldAnnounce) {
    announceCurrentPlayerTurn()
  }
}

function handleDragStart(e) {
  const card = e.target.closest(".player-card")
  if (card) {
    e.dataTransfer.setData("text/plain", card.dataset.playerName)
  }
}

function handleDragOver(e) {
  e.preventDefault()
}

function handleDragEnter(e) {
  e.preventDefault()
  const card = e.target.closest(".player-card")
  if (card) {
    card.classList.add("drag-over")
  }
}

function handleDragLeave(e) {
  const card = e.target.closest(".player-card")
  if (card) {
    card.classList.remove("drag-over")
  }
}

function handleDragEnd(e) {
  document.querySelectorAll(".player-card").forEach((card) => {
    card.classList.remove("drag-over")
  })
}

function handleDrop(e) {
  e.preventDefault()
  const dropTarget = e.target.closest(".player-card")
  if (dropTarget) {
    dropTarget.classList.remove("drag-over")
  }
  const draggedName = e.dataTransfer.getData("text/plain")

  if (!dropTarget || !draggedName) return

  const draggedIndex = players.findIndex((p) => p.name === draggedName)
  const dropIndex = players.findIndex(
    (p) => p.name === dropTarget.dataset.playerName
  )

  if (draggedIndex !== -1 && dropIndex !== -1) {
    ;[players[draggedIndex], players[dropIndex]] = [
      players[dropIndex],
      players[draggedIndex],
    ]
    updatePlayerScores()
    saveActiveSessionPlayers(players.map((p) => p.name))
  }
}

function isMatch(first, second) {
  // Helper function
  function addPlayerTagsAndUpdateScore(first, second) {
    if (!players || !players[currentPlayerIndex]) {
      // No players are added
      return
    }

    // Add player tag to matched cards
    const playerTag = document.createElement("div")
    playerTag.className = "player-tag"
    playerTag.textContent = players[currentPlayerIndex].name
    first.appendChild(playerTag.cloneNode(true))
    second.appendChild(playerTag)

    // Update player score
    players[currentPlayerIndex].score++
    updatePlayerScores()
  }

  const firstContent = first.dataset.content
  const secondContent = second.dataset.content

  const matchedItem = combinedUnitItems.find(
    (item) =>
      (item.word === firstContent && item.image === secondContent) ||
      (item.image === firstContent && item.word === secondContent)
  )

  if (matchedItem) {
    const matchColor = getRandomMatchColor()
    first.classList.add("matched", matchColor)
    second.classList.add("matched", matchColor)
    addPlayerTagsAndUpdateScore(first, second)
    return true
  }
  return false
}

// Add a dropdown to select units
function createUnitSelector() {
  const urlParams = new URLSearchParams(window.location.search)
  const unitsParam = urlParams.get("units")
  const seriesParam = urlParams.get("series")
  const bookParam = urlParams.get("book")
  const unitParam = urlParams.get("unit")

  activeUnits = []

  if (unitsParam) {
    const unitSpecs = unitsParam.split(",")
    unitSpecs.forEach((spec) => {
      const [series, book, unitNumber] = spec.split("|")
      const unitName = Object.keys(cardLibrary[series][book]).find((unit) =>
        unit.startsWith(`Unit ${unitNumber}`)
      )
      if (unitName) {
        activeUnits.push({ series, book, unitName })
      }
    })
  } else if (seriesParam && bookParam && unitParam) {
    const unitName = Object.keys(cardLibrary[seriesParam][bookParam]).find((unit) =>
      unit.startsWith(`Unit ${unitParam}`)
    )
    if (unitName) {
      activeUnits.push({ series: seriesParam, book: bookParam, unitName })
    }
  }



  const selector = document.getElementById("unit-selector")
  selector.innerHTML = "" // Clear existing options

  const defaultOption = document.createElement("option")
  defaultOption.value = ""
  defaultOption.selected = true
  defaultOption.textContent = "Add unit..."
  selector.appendChild(defaultOption)

  Object.keys(cardLibrary).forEach((series) => {
    const seriesGroup = document.createElement("optgroup")
    seriesGroup.label = series

    Object.keys(cardLibrary[series]).forEach((book, bookIndex) => {
      if (bookIndex > 0) {
        const separator = document.createElement("option")
        separator.textContent = `---`
        separator.disabled = true
        seriesGroup.appendChild(separator)
      }

      Object.keys(cardLibrary[series][book]).forEach((unit) => {
        const option = document.createElement("option")
        const unitNumber = unit.match(/Unit (\d+)/)[1]
        option.value = `${series}|${book}|${unitNumber}`
        option.textContent = `L${book}: ${unit}`
        seriesGroup.appendChild(option)
      })
    })
    const separator = document.createElement("hr")
    selector.appendChild(separator)
    selector.appendChild(seriesGroup)
  })

  selector.addEventListener("change", (e) => {
    if (!e.target.value) return
    const [series, book, unitNumber] = e.target.value.split("|")
    addActiveUnit(series, book, unitNumber)
  })

  loadActiveUnits()
  renderSelectedUnitsList()
}

function createCards() {
  // console.log("Creating cards...")
  // console.log("Words:", words)

  // Group available unique items by active unit
  const unitsData = activeUnits.map((u) => {
    const unitItems = cardLibrary[u.series][u.book][u.unitName] || []
    const validItems = unitItems.filter((item) => item.word && item.image)
    const uniqueValidItems = []
    validItems.forEach((item) => {
      const exists = uniqueValidItems.some(
        (ui) => ui.word === item.word && ui.image === item.image
      )
      if (!exists) {
        uniqueValidItems.push(item)
      }
    })
    return {
      series: u.series,
      book: u.book,
      unitName: u.unitName,
      items: uniqueValidItems,
      selected: []
    }
  })

  // Calculate total unique pairs across all active units
  const allUniquePairs = []
  unitsData.forEach((ud) => {
    ud.items.forEach((item) => {
      const exists = allUniquePairs.some(
        (p) => p.word === item.word && p.image === item.image
      )
      if (!exists) {
        allUniquePairs.push(item)
      }
    })
  })

  // Target number of pairs: the user's maxPairs, with a minimum of minWordLength.
  // totalUniqueCount is NOT a cap — the duplication logic fills any shortfall.
  const totalUniqueCount = allUniquePairs.length
  if (totalUniqueCount === 0) return

  // numPairs = whatever the user chose (bounded by input min/max attributes)
  numPairs = maxPairs

  // 1. Select unique pairs using round-robin among units
  const selectedPairs = []
  let progress = true
  while (selectedPairs.length < numPairs && progress) {
    progress = false
    for (let i = 0; i < unitsData.length; i++) {
      if (selectedPairs.length >= numPairs) break

      const ud = unitsData[i]
      const availableItems = ud.items.filter((item) => {
        return !selectedPairs.some(
          (sp) => sp.word === item.word && sp.image === item.image
        )
      })

      if (availableItems.length > 0) {
        const idx = Math.floor(Math.random() * availableItems.length)
        const chosen = availableItems[idx]
        selectedPairs.push(chosen)
        ud.selected.push(chosen)
        progress = true
      }
    }
  }

  // 2. If we still need more pairs (due to duplication to reach minWordLength),
  // duplicate selected pairs using round-robin among units
  if (selectedPairs.length < numPairs) {
    const eligibleUnits = unitsData.filter((ud) => ud.selected.length > 0)
    if (eligibleUnits.length > 0) {
      eligibleUnits.forEach((ud) => {
        ud.dupCounts = new Array(ud.selected.length).fill(0)
      })

      let dupProgress = true
      while (selectedPairs.length < numPairs && dupProgress) {
        dupProgress = false
        for (let i = 0; i < eligibleUnits.length; i++) {
          if (selectedPairs.length >= numPairs) break

          const ud = eligibleUnits[i]
          const minDups = Math.min(...ud.dupCounts)
          const candidates = ud.dupCounts
            .map((count, idx) => (count === minDups ? idx : -1))
            .filter((idx) => idx !== -1)

          if (candidates.length > 0) {
            const randCandidateIdx = candidates[Math.floor(Math.random() * candidates.length)]
            const chosen = ud.selected[randCandidateIdx]
            selectedPairs.push(chosen)
            ud.dupCounts[randCandidateIdx]++
            dupProgress = true
          }
        }
      }
    }
  }

  // Create pairs first
  const pairs = selectedPairs.map((item) => ({
    word: item.word,
    image: item.image,
  }))

  // Create array of all items
  let items = pairs.flatMap((pair) => [pair.word, pair.image])

  // Fisher-Yates shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }

  items.forEach((item, index) => {
    const container = document.createElement("div")
    container.className = "card-container"
    container.style.setProperty("--index", index)

    const card = document.createElement("div")
    card.classList.add("card", "hidden")
    card.dataset.content = item

    // Create front side with number
    const numberSide = document.createElement("div")
    numberSide.classList.add("number")
    numberSide.textContent = (index + 1).toString()
    card.appendChild(numberSide)

    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"]

    // Create back side with content (image or word)
    if (imageExtensions.some((ext) => item.endsWith(ext))) {
      const imgContainer = document.createElement("div")
      imgContainer.classList.add("image")
      const img = document.createElement("img")
      img.src = item
      imgContainer.appendChild(img)
      card.appendChild(imgContainer)
    } else {
      const wordContainer = document.createElement("div")
      wordContainer.classList.add("word")

      // targetLetters will be highlighted. The list comes from the cardLibrary
      if (!targetLetters) {
        // If no targetLetters specified, wrap the second letter in a span
        if (currentBook === "1" && currentSeries === "SmartPhonics") {
          const modifiedWord =
            item.slice(0, 1) +
            `<span class="target-sounds">${item.slice(1, 2)}</span>` +
            item.slice(2)
          wordContainer.innerHTML = modifiedWord
        } else {
          wordContainer.textContent = item
        }
      } else {
        // Split target letters into array (e.g., ["bl", "cl", "fl"] or ["a", "e"])
        const targetLetterArray = targetLetters.split(", ")
        // Store original word to process
        let remainingWord = item
        // Initialize empty result string to build highlighted word
        let result = ""

        // Process word character by character
        let i = 0
        while (i < remainingWord.length) {
          // Track if we found a target sound at current position
          let foundTarget = false

          // Check each target sound (e.g., "bl" or "a")
          for (const target of targetLetterArray) {
            // Look ahead in word for target sound match
            // e.g., in "blade", check if "bl" matches at position 0
            if (
              remainingWord.slice(i, i + target.length).toLowerCase() ===
              target.toLowerCase()
            ) {
              // Found target sound - wrap in span for highlighting
              // e.g., <span class="target-sounds">bl</span>ade
              result += `<span class="target-sounds">${remainingWord.slice(
                i,
                i + target.length
              )}</span>`
              // Skip past entire target sound
              i += target.length
              foundTarget = true
              break // Exit target sound loop
            }
          }

          // If no target sound found at current position
          // add single character and move to next position
          // e.g., add "a" in "blade" after processing "bl"
          if (!foundTarget) {
            result += remainingWord[i]
            i++
          }
        }

        wordContainer.innerHTML = result
      }

      card.appendChild(wordContainer)
    }

    container.appendChild(card)
    gameBoard.appendChild(container)
  })

  adjustGridSizing()
}

function loadActiveUnits() {
  if (activeUnitsLabel) {
    if (activeUnits.length === 0) {
      activeUnitsLabel.textContent = ""
    } else {
      activeUnitsLabel.textContent = activeUnits
        .map((u) => {
          const seriesPrefix = u.series === "SmartPhonics" ? "SP" : (u.series === "LetsSmile" ? "LS" : u.series)
          return `${seriesPrefix}: L${u.book}: ${u.unitName}`
        })
        .join(" | ")
    }
  }

  if (activeUnits.length === 0) {
    combinedUnitItems = []
    words = []
    images = []
    soundMap = {}
    targetLetters = ""

    if (gameBoard) {
      gameBoard.innerHTML = '<div class="no-units-message">Please select a card unit in settings to start playing!</div>'
    }

    disablePlayerDragging()

    const scoresContainer = document.getElementById("player-scores-container")
    if (scoresContainer) scoresContainer.style.display = "none"

    updateUnitsURL()
    return
  }

  // Combine unique valid items across all active units
  let combinedItems = []
  activeUnits.forEach((u) => {
    const unitItems = cardLibrary[u.series][u.book][u.unitName]
    const validItems = unitItems.filter((item) => item.word && item.image)
    validItems.forEach((item) => {
      const exists = combinedItems.some(
        (ci) => ci.word === item.word && ci.image === item.image
      )
      if (!exists) {
        combinedItems.push(item)
      }
    })
  })

  combinedUnitItems = combinedItems
  words = combinedItems.map((item) => item.word)
  images = combinedItems.map((item) => item.image)

  soundMap = preloadSoundsArray(combinedUnitItems)

  // Combine target letters from all active units
  let combinedTargetLetters = []
  activeUnits.forEach((u) => {
    const unitItems = cardLibrary[u.series][u.book][u.unitName]
    const metaItem = unitItems.find((item) => item.targetLetters)
    if (metaItem && metaItem.targetLetters) {
      combinedTargetLetters.push(metaItem.targetLetters)
    }
  })
  targetLetters = combinedTargetLetters.join(", ")

  currentSeries = activeUnits[0].series
  currentBook = activeUnits[0].book

  // Allow up to 50 matches regardless of unique pair count (extras are duplicated)
  pairsInput.max = 50
  pairsInput.min = minPairs

  pairsInput.value = Math.min(maxPairs, 50)

  // Reset the game with new words and images
  resetGame()
  enablePlayerDragging()
}

function addActiveUnit(series, book, unitNumber) {
  const unitName = Object.keys(cardLibrary[series][book]).find((unit) =>
    unit.startsWith(`Unit ${unitNumber}`)
  )
  if (!unitName) return

  const alreadyExists = activeUnits.some(
    (u) => u.series === series && u.book === book && u.unitName === unitName
  )
  if (alreadyExists) return

  activeUnits.push({ series, book, unitName })
  loadActiveUnits()
  renderSelectedUnitsList()

  const selector = document.getElementById("unit-selector")
  if (selector) selector.value = ""
}

function removeActiveUnit(index) {
  activeUnits.splice(index, 1)
  loadActiveUnits()
  renderSelectedUnitsList()
}

function renderSelectedUnitsList() {
  const container = document.getElementById("selected-units-list")
  if (!container) return

  container.innerHTML = ""

  activeUnits.forEach((u, index) => {
    const pill = document.createElement("div")
    pill.className = "unit-pill"

    const label = document.createElement("span")
    const seriesPrefix = u.series === "SmartPhonics" ? "SP" : (u.series === "LetsSmile" ? "LS" : u.series)
    label.textContent = `${seriesPrefix}: L${u.book}: ${u.unitName}`
    pill.appendChild(label)

    const removeBtn = document.createElement("button")
    removeBtn.className = "remove-unit-btn"
    removeBtn.innerHTML = "&times;"
    removeBtn.title = "Remove unit"
    removeBtn.addEventListener("click", () => removeActiveUnit(index))
    pill.appendChild(removeBtn)

    container.appendChild(pill)
  })

  updateUnitsURL()
}

function updateUnitsURL() {
  const url = new URL(window.location)
  const unitsParam = activeUnits
    .map((u) => {
      const unitNumber = u.unitName.match(/Unit (\d+)/)[1]
      return `${u.series}|${u.book}|${unitNumber}`
    })
    .join(",")
  url.searchParams.set("units", unitsParam)

  url.searchParams.delete("series")
  url.searchParams.delete("book")
  url.searchParams.delete("unit")

  window.history.pushState({}, "", url)
}

function resetGame() {
  gameBoard.innerHTML = ""
  firstSelected = null
  lockBoard = false
  matchedPairs = 0
  tries = 0
  usedMatchColors = []
  players.forEach((player) => (player.score = 0))
  currentPlayerIndex = 0
  currentTurnCardClicked = false
  updatePlayerScores()
  updateScore()
  createCards()
  precachePlayerTurnAudios()
}

function stopActiveCardAudio() {
  if (activeCardAudio) {
    try {
      activeCardAudio.pause()
      activeCardAudio.currentTime = 0
      activeCardAudio.dispatchEvent(new Event("interrupted"))
    } catch (e) {
      console.error("Error stopping card audio:", e)
    }
    activeCardAudio = null
  }
}

function resetTurn() {
  stopActiveCardAudio()

  if (firstSelected) {
    firstSelected.classList.remove("revealed")
    firstSelected.classList.add("hidden")
    firstSelected = null
  }

  // Also flip any card that is temporarily revealed but not matched
  const revealedCards = gameBoard.querySelectorAll(".card.revealed:not(.matched)")
  revealedCards.forEach((card) => {
    card.classList.remove("revealed")
    card.classList.add("hidden")
  })

  lockBoard = false
}

const verifyApiKey = async (apiKey) => {
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey
      }
    })
    return response.ok
  } catch (e) {
    return false
  }
}

async function fetchElevenLabsAudio(text, voiceId) {
  const apiKey = localStorage.getItem("elevenlabs_api_key")
  if (!apiKey) return null

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
  const payload = {
    text: text,
    model_id: "eleven_flash_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      speed: 0.85
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify(payload)
    })

    if (response.ok) {
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      return new Audio(blobUrl)
    } else {
      console.error(`ElevenLabs generation failed for "${text}":`, response.statusText)
    }
  } catch (e) {
    console.error(`Error generating ElevenLabs audio for "${text}":`, e)
  }
  return null
}

function stopAllTurnVoices() {
  if (playingTurnAudio) {
    try {
      playingTurnAudio.pause()
      playingTurnAudio.currentTime = 0
    } catch (e) {}
    playingTurnAudio = null
  }
  if (playingKeepGoingAudio) {
    try {
      playingKeepGoingAudio.pause()
      playingKeepGoingAudio.currentTime = 0
    } catch (e) {}
    playingKeepGoingAudio = null
  }
}

const announceCurrentPlayerTurn = async () => {
  if (!isNarratorEnabled) return
  const apiKey = localStorage.getItem("elevenlabs_api_key")
  if (!apiKey || players.length === 0) return

  const activePlayer = players[currentPlayerIndex]
  if (!activePlayer) return

  const targetPlayerIndex = currentPlayerIndex

  // If player clicked a card before the announcement is made, skip it
  if (currentTurnCardClicked) return

  if (activePlayer.turnAudio) {
    activePlayer.turnAudio.currentTime = 0
    playingTurnAudio = activePlayer.turnAudio
    // Final check before playing
    if (currentTurnCardClicked || currentPlayerIndex !== targetPlayerIndex) return
    activePlayer.turnAudio.play().catch((e) => console.error("Error playing turn audio:", e))
    return
  }

  const audio = await fetchElevenLabsAudio(`${activePlayer.name}'s turn`, activePlayer.voiceId)
  if (audio) {
    activePlayer.turnAudio = audio
    // Final check before playing
    if (currentTurnCardClicked || currentPlayerIndex !== targetPlayerIndex) return
    playingTurnAudio = audio
    audio.play().catch((e) => console.error("Error playing turn audio:", e))
  }
}

async function precachePlayerTurnAudios() {
  const apiKey = localStorage.getItem("elevenlabs_api_key")
  if (!apiKey || players.length === 0) return

  // Run caching sequentially in the background for each player
  for (const player of players) {
    if (player.turnAudio) continue

    const audio = await fetchElevenLabsAudio(`${player.name}'s turn`, player.voiceId)
    if (audio) {
      player.turnAudio = audio
    }
  }
}

const keepGoingCache = {}
let currentKeepGoingVoiceIndex = 0

async function precacheKeepGoingVoice(index) {
  const apiKey = localStorage.getItem("elevenlabs_api_key")
  if (!apiKey || voiceList.length === 0) return

  const voiceId = voiceList[index % voiceList.length]
  if (keepGoingCache[voiceId]) return // Already cached

  const audio = await fetchElevenLabsAudio("Keep going!", voiceId)
  if (audio) {
    keepGoingCache[voiceId] = audio
  }
}

async function playKeepGoingAnnouncement() {
  if (!isNarratorEnabled) return
  const apiKey = localStorage.getItem("elevenlabs_api_key")
  if (!apiKey) return

  // If a card was clicked before the announcement starts, skip it
  if (currentTurnCardClicked) return

  const voiceId = voiceList[currentKeepGoingVoiceIndex % voiceList.length]

  if (keepGoingCache[voiceId]) {
    const cachedAudio = keepGoingCache[voiceId]
    cachedAudio.currentTime = 0
    playingKeepGoingAudio = cachedAudio
    // Final check before playing
    if (currentTurnCardClicked) return
    cachedAudio.play().catch((e) => console.error("Error playing cached 'Keep going!' audio:", e))
  } else {
    // Fallback if not cached yet
    const audio = await fetchElevenLabsAudio("Keep going!", voiceId)
    if (audio) {
      keepGoingCache[voiceId] = audio
      // Final check before playing
      if (currentTurnCardClicked) return
      playingKeepGoingAudio = audio
      audio.play().catch((e) => console.error("Error playing 'Keep going!' audio:", e))
    }
  }

  // Precache the next voice in the background
  currentKeepGoingVoiceIndex++
  precacheKeepGoingVoice(currentKeepGoingVoiceIndex)
}

function resetCachedVoices() {
  players.forEach((player) => {
    if (player.turnAudio) {
      try {
        URL.revokeObjectURL(player.turnAudio.src)
      } catch (e) {}
      player.turnAudio = null
    }
  })
  // Clear the "Keep going!" cache
  Object.keys(keepGoingCache).forEach((key) => {
    try {
      URL.revokeObjectURL(keepGoingCache[key].src)
    } catch (e) {}
    delete keepGoingCache[key]
  })
  // Reset index and precache the first voice again
  currentKeepGoingVoiceIndex = 0
  precacheKeepGoingVoice(0)
}

function updatePlayerNames() {
  const playerNameInput = document.getElementById("player-names-input")
  const addPlayersButton = document.getElementById("add-players-btn")
  const input = playerNameInput.value

  // Save the raw input to localStorage
  localStorage.setItem("playerNamesInput", input)

  // Split by comma or newline and clean up whitespace
  const names = input
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

  // Update players array
  players = names.map((name, index) => ({
    name,
    score: 0,
    voiceId: voiceList[index % voiceList.length],
    turnAudio: null
  }))
  currentPlayerIndex = 0
  initializePlayerStats()
  updatePlayerScores()
  enablePlayerDragging()
  precachePlayerTurnAudios()
  addPlayersButton.textContent = "Update Players"

  // Save to shared active session
  saveActiveSessionPlayers(names)

  // Close the settings sidebar
  const sidebar = document.getElementById("settings-sidebar")
  const overlay = document.getElementById("sidebar-overlay")
  if (sidebar && overlay) {
    sidebar.classList.remove("open")
    overlay.classList.remove("open")
  }

  return true
}

// Load saved names when the page loads
function loadSavedPlayerNames() {
  let names = []
  const sharedActive = localStorage.getItem(SHARED_ACTIVE_PLAYERS_KEY)
  const playerNameInput = document.getElementById("player-names-input")

  if (sharedActive) {
    try {
      const parsed = JSON.parse(sharedActive)
      if (Array.isArray(parsed) && parsed.length > 0) {
        names = parsed
        if (playerNameInput) {
          playerNameInput.value = names.join(", ")
        }
      }
    } catch (e) {
      console.error("Error parsing shared active players:", e)
    }
  }

  // Fallback to legacy playerNamesInput
  if (names.length === 0) {
    const savedInput = localStorage.getItem("playerNamesInput")
    if (savedInput) {
      if (playerNameInput) {
        playerNameInput.value = savedInput
      }
      names = savedInput
        .split(/[,\n]/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    }
  }

  if (names.length > 0) {
    players = names.map((name, index) => ({
      name,
      score: 0,
      voiceId: voiceList[index % voiceList.length],
      turnAudio: null
    }))
    currentPlayerIndex = 0
    initializePlayerStats()
    updatePlayerScores()
    precachePlayerTurnAudios()
  }
}

// Load saved rules preference
function loadSavedRulesPreference() {
  const savedPreference = localStorage.getItem("matchingGameKeepTurn")
  const rulesButton = document.getElementById("rules-button")
  if (savedPreference !== null) {
    keepTurnOnMatch = savedPreference === "true"
  } else {
    keepTurnOnMatch = true
  }
  if (rulesButton) {
    rulesButton.classList.toggle("off", !keepTurnOnMatch)
    rulesButton.textContent = `Bonus Turns: ${keepTurnOnMatch ? "On" : "Off"}`
  }
}

function updateScore() {
  triesDisplay.textContent = `Tries: ${tries}`
}

function updatePlayerScores() {
  const scoresContainer = document.getElementById("player-scores-container")
  if (players.length === 0) {
    if (scoresContainer) scoresContainer.style.display = "none"
    return
  }

  if (scoresContainer) scoresContainer.style.display = "flex"
  const scoresDiv = document.getElementById("player-scores")
  scoresDiv.style.display = "flex"

  const currentElements = Array.from(scoresDiv.children)
  const playersHaveChanged =
    currentElements.length !== players.length ||
    currentElements.some(
      (element) => !players.find((p) => p.name === element.dataset.playerName)
    )

  if (playersHaveChanged) {
    scoresDiv.innerHTML = ""
    players.forEach((player, index) => {
      const playerScore = document.createElement("div")
      playerScore.dataset.playerName = player.name
      playerScore.className = "player-card"
      if (index === currentPlayerIndex) {
        playerScore.classList.add("current-player")
      }


      // Create info wrapper
      const info = document.createElement("div")
      info.className = "player-info"

      const nameSpan = document.createElement("span")
      nameSpan.className = "player-name"
      nameSpan.textContent = player.name
      info.appendChild(nameSpan)

      const scoreSpan = document.createElement("span")
      scoreSpan.className = "player-score"
      scoreSpan.textContent = player.score
      info.appendChild(scoreSpan)

      playerScore.appendChild(info)

      // Create drag handle
      const dragHandle = document.createElement("span")
      dragHandle.className = "drag-handle"
      dragHandle.innerHTML = "⋮⋮"
      dragHandle.style.display = isDraggingEnabled ? "inline-block" : "none"
      playerScore.appendChild(dragHandle)

      scoresDiv.appendChild(playerScore)
    })

    if (isDraggingEnabled) {
      enablePlayerDragging()
    }
  } else {
    players.forEach((player, index) => {
      const playerElement = scoresDiv.querySelector(
        `[data-player-name="${player.name}"]`
      )
      if (playerElement) {
        // Update score
        const scoreSpan = playerElement.querySelector(".player-score")
        if (scoreSpan && scoreSpan.textContent !== player.score.toString()) {
          scoreSpan.textContent = player.score
          // Add quick pop/scale micro-animation
          scoreSpan.animate([
            { transform: "scale(1)" },
            { transform: "scale(1.3)", color: "var(--button-background)" },
            { transform: "scale(1)" }
          ], { duration: 300, easing: "ease-out" })
        }

        // Update active class
        const wasCurrent = playerElement.classList.contains("current-player")
        const isCurrent = index === currentPlayerIndex
        
        if (isCurrent && !wasCurrent) {
          playerElement.classList.add("current-player")
          // Animation when becoming active
          playerElement.animate([
            { transform: "scale(1)" },
            { transform: "scale(1.08)" },
            { transform: "scale(1.05)" }
          ], { duration: 250, easing: "ease-out" })
        } else if (!isCurrent && wasCurrent) {
          playerElement.classList.remove("current-player")
        }

        // Update drag handle visibility
        const dragHandle = playerElement.querySelector(".drag-handle")
        if (dragHandle) {
          dragHandle.style.display = isDraggingEnabled ? "inline-block" : "none"
        }

        // Restore drag/draggable state
        const wasDraggable = playerElement.classList.contains("draggable")
        if (isDraggingEnabled && !wasDraggable) {
          playerElement.classList.add("draggable")
          playerElement.draggable = true
        } else if (!isDraggingEnabled && wasDraggable) {
          playerElement.classList.remove("draggable")
          playerElement.draggable = false
        }

        scoresDiv.appendChild(playerElement)
      }
    })
  }
}

function triggerConfetti() {
  const canvas = document.createElement("canvas")
  canvas.style.position = "fixed"
  canvas.style.top = "0"
  canvas.style.left = "0"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.pointerEvents = "none"
  canvas.style.zIndex = "9999"
  document.body.appendChild(canvas)

  const ctx = canvas.getContext("2d")
  let width = (canvas.width = window.innerWidth)
  let height = (canvas.height = window.innerHeight)

  const handleResize = () => {
    width = canvas.width = window.innerWidth
    height = canvas.height = window.innerHeight
  }
  window.addEventListener("resize", handleResize)

  const colors = ["#ff5964", "#35a7ff", "#ffe74c", "#38b000", "#ff9f1c", "#e0aaff"]
  const particles = []

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * -height - 20,
      r: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0,
      speed: Math.random() * 3 + 2
    })
  }

  let animationFrameId
  const startTime = Date.now()

  function draw() {
    ctx.clearRect(0, 0, width, height)

    if (Date.now() - startTime > 5000) {
      window.removeEventListener("resize", handleResize)
      if (canvas.parentNode) {
        document.body.removeChild(canvas)
      }
      cancelAnimationFrame(animationFrameId)
      return
    }

    particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental
      p.y += p.speed
      p.x += Math.sin(p.tiltAngle) * 0.5

      ctx.beginPath()
      ctx.lineWidth = p.r
      ctx.strokeStyle = p.color
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y)
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2)
      ctx.stroke()
    })

    animationFrameId = requestAnimationFrame(draw)
  }

  draw()
}

function showCompletionModal(tries) {
  const modal = document.getElementById("completion-modal")
  const modalScores = document.getElementById("modal-player-scores")
  const finalScore = document.getElementById("final-score")
  finalScore.textContent = tries
  const statsDiv = document.createElement("div")
  statsDiv.className = "stats-container"

  // Helper function to create table
  function createStatsTable(title, players, statsType) {
    const tableWrapper = document.createElement("div")
    tableWrapper.className = "table-wrapper"

    const tableTitle = document.createElement("h3")
    tableTitle.textContent = title
    tableWrapper.appendChild(tableTitle)

    const table = document.createElement("table")
    table.className = "stats-table"

    const headerRow = document.createElement("tr")
    headerRow.innerHTML = `
        <th></th>
        <th>Wins</th>
        <th>Matches Found</th>
        ${statsType === "allTime" ? "<th>Games Played</th>" : ""}
    `
    table.appendChild(headerRow)

    players.forEach((player) => {
      const stats = playerStats.players[player.name]
      if (stats) {
        const row = document.createElement("tr")
        row.innerHTML = `
                <td class="player-name-cell">${player.name}</td>
                <td>${
                  statsType === "allTime"
                    ? stats.allTime.gamesWon
                    : stats.session.sessionGamesWon
                }</td>
                <td>${
                  statsType === "allTime"
                    ? stats.allTime.totalMatchesFound
                    : stats.session.sessionMatchesFound
                }</td>
                ${
                  statsType === "allTime"
                    ? `<td>${stats.allTime.gamesPlayed}</td>`
                    : ""
                }
            `
        table.appendChild(row)
      }
    })

    tableWrapper.appendChild(table)
    return tableWrapper
  }

  // Only show player scores if players array exists and has entries
  if (players && players.length > 0) {
    // Clear and update modal scores
    modalScores.innerHTML = ""

    // Sort players by score in descending order
    let sortedPlayers = [...players].sort((a, b) => b.score - a.score)

    // Get the highest score
    const highestScore = sortedPlayers[0].score

    updateStatsAfterWin(highestScore)

    // Add each player's score to the modal
    sortedPlayers.forEach((player) => {
      const playerScore = document.createElement("div")
      playerScore.className = "modal-player-score"

      // Add winner-name class to all players with the highest score
      if (player.score === highestScore) {
        playerScore.classList.add("winner-name")

        // Create trophy icon
        const trophyIcon = document.createElement("span")
        trophyIcon.className = "trophy-icon"
        trophyIcon.innerHTML = "🏆" // Unicode trophy emoji

        // Create a wrapper for the name and trophy
        const playerNameWrapper = document.createElement("span")
        playerNameWrapper.appendChild(trophyIcon)
        playerNameWrapper.appendChild(
          document.createTextNode(` ${player.name}`)
        )

        playerScore.textContent = "" // Clear previous text
        playerScore.appendChild(playerNameWrapper)
        playerScore.innerHTML += `: ${player.score}`
      } else {
        playerScore.textContent = `${player.name}: ${player.score}`
      }

      modalScores.appendChild(playerScore)
    })

    // Sort players by session score, then session matches found in descending order
    sortedPlayers = [...players].sort((a, b) => {
      const statsA = playerStats.players[a.name].session
      const statsB = playerStats.players[b.name].session

      // First compare session wins
      if (statsB.sessionGamesWon !== statsA.sessionGamesWon) {
        return statsB.sessionGamesWon - statsA.sessionGamesWon
      }

      // If wins are tied, compare matches found
      return statsB.sessionMatchesFound - statsA.sessionMatchesFound
    })

    // Create and append session stats table
    statsDiv.appendChild(
      createStatsTable("Session Stats", sortedPlayers, "session")
    )

    // Sort players by all time score, then all time matches found in descending order
    sortedPlayers = [...players].sort((a, b) => {
      const statsA = playerStats.players[a.name].allTime
      const statsB = playerStats.players[b.name].allTime

      // First compare session wins
      if (statsB.gamesWon !== statsA.gamesWon) {
        return statsB.gamesWon - statsA.gamesWon
      }

      // If wins are tied, compare matches found
      return statsB.totalMatchesFound - statsA.totalMatchesFound
    })

    // Create and append all-time stats table
    // statsDiv.appendChild(
    //   createStatsTable("All-Time Stats", sortedPlayers, "allTime")
    // )

    modalScores.appendChild(statsDiv)

    // Show the scores section
    modalScores.closest(".modal-scores").style.display = "block"
  } else {
    // Hide the scores section if no players
    modalScores.closest(".modal-scores").style.display = "none"
  }

  // Show modal with animation
  setTimeout(() => {
    modal.classList.add("visible")
  }, 600)
}

function hideCompletionModal() {
  const modal = document.getElementById("completion-modal")
  modal.classList.remove("visible")
}

gameBoard.addEventListener("click", async function (event) {
  const target = event.target
  if (target instanceof HTMLElement) {
    const clicked = target.closest(".card")
    if (!clicked || clicked.classList.contains("revealed") || lockBoard) return

    // Immediately flag that a card was clicked this turn and stop any active turn announcement!
    currentTurnCardClicked = true
    stopAllTurnVoices()

    // Hide reordering buttons on first card click
    if (isDraggingEnabled) {
      disablePlayerDragging(false)
    }

    clicked.classList.remove("hidden")
    clicked.classList.add("revealed")

    // Get the clicked content (word or image path)
    const clickedContent = clicked.dataset.content

    // Find the corresponding item in combinedUnitItems
    const soundItem = combinedUnitItems.find(
      (item) => item.word === clickedContent || item.image === clickedContent
    )

    if (soundItem) {
      lockBoard = true
      const isImageCard =
        clickedContent.includes(".jpg") ||
        clickedContent.includes(".png") ||
        clickedContent.includes(".jpeg") ||
        clickedContent.includes(".webp")

      // For Smart Phonics 1, images and words have different sounds
      if (
        currentBook === "1" &&
        currentSeries === "SmartPhonics" &&
        isImageCard
      ) {
        // Play the image vocabulary sound
        activeCardAudio = new Audio(soundItem.imageSound)
      } else {
        // Play the regular sound
        activeCardAudio = soundMap[soundItem.word]
      }

      if (activeCardAudio) {
        await playSound(activeCardAudio)
      }
      activeCardAudio = null
      lockBoard = false
    }

    // Check if the card was reset/flipped back down while the audio was playing
    if (clicked.classList.contains("hidden")) return

    if (!firstSelected) {
      firstSelected = clicked
    } else {
      lockBoard = true // Prevent more clicks until this check is done
      tries++
      updateScore()
      let nextPlayer = false
      let changePlayerPromise = Promise.resolve()

      if (isMatch(firstSelected, clicked)) {
        // Play match sound
        const matchSoundPromise = playSound(matchSound)
        firstSelected = null
        lockBoard = false
        matchedPairs += 1 // Increment the matched pair count
        if (players[currentPlayerIndex]) {
          updateStatsForMatch(players[currentPlayerIndex].name)
        }

        currentTurnCardClicked = false

        // Check if the game is complete
        if (matchedPairs === numPairs) {
          // Play completion sound
          playSound(completeSound)
          triggerConfetti()
          showCompletionModal(tries)
        } else {
          // Play ElevenLabs "Keep going!" after match sound finishes
          matchSoundPromise.then(() => {
            playKeepGoingAnnouncement()
          })
        }

        if (!keepTurnOnMatch) {
          nextPlayer = true
        }
      } else {
        // Reset the sound to the beginning, so it plays if a match is tried quickly
        wrongSound.currentTime = 0
        const wrongSoundPromise = playSound(wrongSound)
        // Delay to allow users to see the cards
        // setTimeout(() => {
        firstSelected.classList.remove("revealed")
        firstSelected.classList.add("hidden")
        clicked.classList.remove("revealed")
        clicked.classList.add("hidden")

        firstSelected = null
        lockBoard = false
        // }, 1000)

        nextPlayer = true
        changePlayerPromise = wrongSoundPromise
      }
      // change to next player
      if (nextPlayer && players.length > 0) {
        const prevIndex = currentPlayerIndex
        currentPlayerIndex = (currentPlayerIndex + 1) % players.length
        if (currentPlayerIndex !== prevIndex) {
          currentTurnCardClicked = false
          changePlayerPromise.then(() => {
            announceCurrentPlayerTurn()
          })
        }
      }
      updatePlayerScores()
    }
  }
})

// Add event listener for the max Matches input
pairsInput.addEventListener("change", (e) => {
  let value = parseInt(e.target.value)
  const min = parseInt(pairsInput.min) || minPairs
  const max = parseInt(pairsInput.max) || 8

  if (isNaN(value)) {
    value = max
  }
  if (value < min) value = min
  if (value > max) value = max

  pairsInput.value = value
  maxPairs = value
  resetGame()
})

// Add event listener for the Play Again button
document.getElementById("play-again-btn").addEventListener("click", () => {
  hideCompletionModal()
  resetGame()
  enablePlayerDragging()
})

// Add escape key support
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // close the modal
    hideCompletionModal()

    // reset current turn
    resetTurn()
  }

  if (e.key === "Backspace") {
    // Don't trigger if the user is typing in an input, textarea, or select element
    const tag = e.target.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return
    }

    resetTurn()

    if (players.length > 0) {
      const prevIndex = currentPlayerIndex
      currentPlayerIndex = (currentPlayerIndex - 1 + players.length) % players.length
      if (currentPlayerIndex !== prevIndex) {
        currentTurnCardClicked = false
        announceCurrentPlayerTurn()
      }
      updatePlayerScores()
    }
  }
})

// Allow clicking outside the modal to close it
document.getElementById("completion-modal").addEventListener("click", (e) => {
  if (e.target.id === "completion-modal") {
    hideCompletionModal()
  }
})

document.addEventListener("DOMContentLoaded", () => {
  const settingsSidebar = document.getElementById("settings-sidebar")
  const sidebarOverlay = document.getElementById("sidebar-overlay")

  const closeSidebar = () => {
    if (settingsSidebar && sidebarOverlay) {
      settingsSidebar.classList.remove("open")
      sidebarOverlay.classList.remove("open")
    }
  }

  // Add event listener for update players button
  document.getElementById("add-players-btn").addEventListener("click", () => {
    if (updatePlayerNames()) {
      resetGame()
    }
  })

  document
    .getElementById("shuffle-btn")
    .addEventListener("click", shufflePlayers)

  const dragBtn = document.getElementById("drag-btn")
  if (dragBtn) {
    dragBtn.addEventListener("click", disablePlayerDragging)
  }

  const rulesButton = document.getElementById("rules-button")
  if (rulesButton) {
    rulesButton.addEventListener("click", () => {
      keepTurnOnMatch = !keepTurnOnMatch
      rulesButton.classList.toggle("off", !keepTurnOnMatch)
      rulesButton.textContent = `Bonus Turns: ${keepTurnOnMatch ? "On" : "Off"}`
      localStorage.setItem("matchingGameKeepTurn", keepTurnOnMatch.toString())
    })
  }

  loadSavedPlayerNames()
  precacheKeepGoingVoice(0)

  // Initialize player sets dropdown
  populatePlayerSetSelect()

  // Pull updates from Upstash on load
  syncWithUpstashOnLoad()

  // Saved Sets UI event listeners
  const playerSetSelect = document.getElementById("player-set-select")
  const deleteSetBtn = document.getElementById("delete-set-btn")
  const newSetNameInput = document.getElementById("new-set-name")
  const saveSetBtn = document.getElementById("save-set-btn")

  if (playerSetSelect) {
    playerSetSelect.addEventListener("change", () => {
      const selectedSetName = playerSetSelect.value
      if (selectedSetName) {
        const sets = getPlayerSets()
        const names = sets[selectedSetName]
        if (names && Array.isArray(names)) {
          const playerNameInput = document.getElementById("player-names-input")
          if (playerNameInput) {
            playerNameInput.value = names.join(", ")
          }
        }
        if (deleteSetBtn) deleteSetBtn.style.display = "inline-block"
      } else {
        if (deleteSetBtn) deleteSetBtn.style.display = "none"
      }
    })
  }

  if (saveSetBtn && newSetNameInput) {
    saveSetBtn.addEventListener("click", () => {
      const setName = newSetNameInput.value.trim()
      const namesInput = document.getElementById("player-names-input").value.trim()

      if (!setName) {
        alert("Please enter a name for your list.")
        return
      }
      if (!namesInput) {
        alert("Please enter at least one player name before saving.")
        return
      }

      const names = namesInput
        .split(/[,\n]/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0)

      if (names.length === 0) {
        alert("Please enter valid player names.")
        return
      }

      const sets = getPlayerSets()
      sets[setName] = names
      savePlayerSets(sets)

      newSetNameInput.value = ""
      populatePlayerSetSelect()
      playerSetSelect.value = setName
      if (deleteSetBtn) deleteSetBtn.style.display = "inline-block"
      alert(`Saved list "${setName}" successfully!`)
    })
  }

  if (deleteSetBtn && playerSetSelect) {
    deleteSetBtn.addEventListener("click", () => {
      const selectedSetName = playerSetSelect.value
      if (!selectedSetName) return

      if (confirm(`Are you sure you want to delete the list "${selectedSetName}"?`)) {
        const sets = getPlayerSets()
        delete sets[selectedSetName]
        savePlayerSets(sets)

        populatePlayerSetSelect()
        playerSetSelect.value = ""
        deleteSetBtn.style.display = "none"
      }
    })
  }

  // Upstash Config event listeners
  const saveSyncBtn = document.getElementById("save-sync-btn")
  const syncStatus = document.getElementById("sync-status")
  const syncDetails = document.getElementById("sync-settings-details")
  const syncSummary = document.getElementById("sync-settings-summary")
  const upstashUrlInput = document.getElementById("upstash-url-input")
  const upstashTokenInput = document.getElementById("upstash-token-input")

  if (saveSyncBtn && upstashUrlInput && upstashTokenInput) {
    // Load existing keys if any
    const savedUrl = localStorage.getItem(UPSTASH_URL_KEY)
    const savedToken = localStorage.getItem(UPSTASH_TOKEN_KEY)
    if (savedUrl) upstashUrlInput.value = savedUrl
    if (savedToken) upstashTokenInput.value = savedToken
    if (savedUrl && savedToken) {
      if (syncSummary) syncSummary.textContent = "Upstash Redis Config (Saved)"
    }

    saveSyncBtn.addEventListener("click", async () => {
      let url = upstashUrlInput.value.trim()
      if (url.endsWith("/")) {
        url = url.slice(0, -1)
      }
      const token = upstashTokenInput.value.trim()

      if (!url || !token) {
        if (syncStatus) {
          syncStatus.textContent = "Please fill in both URL and Token"
          syncStatus.className = "api-key-status error"
        }
        return
      }

      if (syncStatus) {
        syncStatus.textContent = "Connecting & Syncing..."
        syncStatus.className = "api-key-status"
      }
      saveSyncBtn.disabled = true

      try {
        // Simple ping/verify by fetching
        const testRes = await fetch(`${url}/get/${SHARED_ACTIVE_PLAYERS_KEY}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (testRes.ok) {
          localStorage.setItem(UPSTASH_URL_KEY, url)
          localStorage.setItem(UPSTASH_TOKEN_KEY, token)

          if (syncStatus) {
            syncStatus.textContent = "Connected & synced successfully!"
            syncStatus.className = "api-key-status success"
          }
          if (syncSummary) syncSummary.textContent = "Upstash Redis Config (Connected)"
          
          saveSyncBtn.disabled = false

          // Run a full sync to load whatever is in the DB
          await syncWithUpstashOnLoad()
          
          setTimeout(() => {
            if (syncDetails) syncDetails.open = false
          }, 1500)
        } else {
          throw new Error("Invalid credentials")
        }
      } catch (err) {
        console.error("Upstash verification error:", err)
        if (syncStatus) {
          syncStatus.textContent = "Connection failed. Please check your credentials."
          syncStatus.className = "api-key-status error"
        }
        if (syncSummary) syncSummary.textContent = "Upstash Redis Config (Error)"
        saveSyncBtn.disabled = false
      }
    })
  }
  loadSavedRulesPreference()
  createUnitSelector()

  const resetUnitsBtn = document.getElementById("reset-units-btn")
  if (resetUnitsBtn) {
    resetUnitsBtn.addEventListener("click", () => {
      activeUnits = []
      loadActiveUnits()
      renderSelectedUnitsList()
    })
  }

  // ElevenLabs configuration initialization
  const apiKeyInput = document.getElementById("api-key-input")
  const saveApiKeyBtn = document.getElementById("save-api-key-btn")
  const apiKeyStatus = document.getElementById("api-key-status")
  const resetVoicesBtn = document.getElementById("reset-voices-btn")
  const voiceDetails = document.getElementById("voice-settings-details")
  const voiceSummary = document.getElementById("voice-settings-summary")

  if (apiKeyInput && saveApiKeyBtn && apiKeyStatus && resetVoicesBtn && voiceDetails && voiceSummary) {
    const savedKey = localStorage.getItem("elevenlabs_api_key")
    if (savedKey) {
      apiKeyInput.value = savedKey
      apiKeyStatus.textContent = "Verifying saved key..."
      apiKeyStatus.className = "api-key-status"
      
      verifyApiKey(savedKey).then((isValid) => {
        if (isValid) {
          apiKeyStatus.textContent = "API Key verified"
          apiKeyStatus.className = "api-key-status success"
          voiceSummary.textContent = "ElevenLabs Config (Connected)"
          precachePlayerTurnAudios()
          precacheKeepGoingVoice(0)
          voiceDetails.open = false
        } else {
          apiKeyStatus.textContent = "Saved API Key is invalid"
          apiKeyStatus.className = "api-key-status error"
          voiceSummary.textContent = "ElevenLabs Config (Error)"
        }
      })
    }

    saveApiKeyBtn.addEventListener("click", async () => {
      const key = apiKeyInput.value.trim()
      if (!key) {
        apiKeyStatus.textContent = "Please enter an API Key"
        apiKeyStatus.className = "api-key-status error"
        return
      }

      apiKeyStatus.textContent = "Verifying key..."
      apiKeyStatus.className = "api-key-status"
      saveApiKeyBtn.disabled = true

      const isValid = await verifyApiKey(key)
      saveApiKeyBtn.disabled = false

      if (isValid) {
        localStorage.setItem("elevenlabs_api_key", key)
        apiKeyStatus.textContent = "API Key verified and saved!"
        apiKeyStatus.className = "api-key-status success"
        voiceSummary.textContent = "ElevenLabs Config (Connected)"
        precachePlayerTurnAudios()
        precacheKeepGoingVoice(0)
        setTimeout(() => {
          voiceDetails.open = false
        }, 1000)
      } else {
        localStorage.removeItem("elevenlabs_api_key")
        apiKeyStatus.textContent = "Verification failed. Invalid API Key."
        apiKeyStatus.className = "api-key-status error"
        voiceSummary.textContent = "ElevenLabs Config (Error)"
      }
    })

    resetVoicesBtn.addEventListener("click", () => {
      resetCachedVoices()
      const originalText = apiKeyStatus.textContent
      const originalClass = apiKeyStatus.className
      apiKeyStatus.textContent = "Voice cache reset!"
      apiKeyStatus.className = "api-key-status success"
      setTimeout(() => {
        apiKeyStatus.textContent = originalText
        apiKeyStatus.className = originalClass
      }, 2000)
    })

    const narratorToggle = document.getElementById("narrator-toggle")
    if (narratorToggle) {
      narratorToggle.checked = isNarratorEnabled
      narratorToggle.addEventListener("change", () => {
        isNarratorEnabled = narratorToggle.checked
        localStorage.setItem("elevenlabs_narrator_enabled", JSON.stringify(isNarratorEnabled))
        if (!isNarratorEnabled) {
          stopAllTurnVoices()
        }
      })
    }
  }

  // Add event listeners for grid resizing
  window.addEventListener("resize", adjustGridSizing)

  // Sidebar toggle event listeners
  const menuToggle = document.getElementById("menu-toggle")
  const sidebarClose = document.getElementById("sidebar-close")

  if (menuToggle && settingsSidebar && sidebarOverlay) {
    menuToggle.addEventListener("click", () => {
      settingsSidebar.classList.add("open")
      sidebarOverlay.classList.add("open")
    })
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar)
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar)
  }

  // Initial call to set sizing
  adjustGridSizing()
})

function adjustGridSizing() {
  const header = document.querySelector(".header")
  const gameBoard = document.getElementById("game-board")

  if (!gameBoard) return

  const headerHeight = header ? header.offsetHeight : 0
  const labelHeight = (activeUnitsLabel && activeUnitsLabel.textContent) ? activeUnitsLabel.offsetHeight : 0

  let verticalBuffer = 45
  if (labelHeight > 0) {
    verticalBuffer += 32
  }
  const totalUsedHeight = headerHeight + verticalBuffer + labelHeight
  const availableHeight = Math.max(200, window.innerHeight - totalUsedHeight)

  gameBoard.style.setProperty("--available-height", `${availableHeight}px`)

  const cards = gameBoard.querySelectorAll(".card-container")
  const totalCards = cards.length
  if (totalCards > 0) {
    const availableWidth = gameBoard.parentElement.clientWidth
    const computedStyle = window.getComputedStyle(gameBoard)
    const gap = parseFloat(computedStyle.gap) || 8

    let bestCols = 2
    let maxCardSize = 0

    let minCols = 2
    let maxCols = Math.min(totalCards, 12)
    if (availableWidth < 480) {
      maxCols = Math.min(totalCards, 3)
    } else if (availableWidth < 768) {
      maxCols = Math.min(totalCards, 7)
    }

    if (totalCards > 4) {
      maxCols = Math.min(maxCols, Math.ceil(totalCards / 2))
    }

    minCols = Math.min(minCols, maxCols)

    for (let c = minCols; c <= maxCols; c++) {
      const r = Math.ceil(totalCards / c)
      const sizeW = (availableWidth - gap * (c - 1)) / c
      const sizeH = (availableHeight - gap * (r - 1)) / r
      const size = Math.min(sizeW, sizeH)

      if (size > maxCardSize) {
        maxCardSize = size
        bestCols = c
      }
    }

    // Prefer a "clean" layout where every row is full, as long as the
    // cards are at least 90% as large as the absolute maximum.
    let cleanBestCols = bestCols
    let cleanBestSize = 0
    for (let c = minCols; c <= maxCols; c++) {
      if (totalCards % c !== 0) continue
      const r = totalCards / c
      const sizeW = (availableWidth - gap * (c - 1)) / c
      const sizeH = (availableHeight - gap * (r - 1)) / r
      const size = Math.min(sizeW, sizeH)
      if (size > cleanBestSize) {
        cleanBestSize = size
        cleanBestCols = c
      }
    }
    if (cleanBestSize > 0 && cleanBestSize >= maxCardSize * 0.90) {
      bestCols = cleanBestCols
      maxCardSize = cleanBestSize
    }

    gameBoard.style.setProperty("--card-size", `${maxCardSize}px`)
    // Lock the board width so flexbox wraps at exactly bestCols per row.
    // Without this, flex would let the browser fit more cards if the
    // container is wide enough, breaking the column count the JS computed.
    const boardWidth = bestCols * maxCardSize + (bestCols - 1) * gap
    gameBoard.style.maxWidth = `${boardWidth}px`

    adjustCardWordFontSize(maxCardSize)
  }
}

function adjustCardWordFontSize(cardSize) {
  const gameBoard = document.getElementById("game-board")
  if (!gameBoard) return

  const cards = Array.from(gameBoard.querySelectorAll(".card .word"))
  if (cards.length === 0) return

  // Set safety bounds based on cardSize
  // - maxWidth leaves 24px (12px on left & right) to keep text away from borders
  // - maxHeight leaves 72px (36px top & bottom clearance when centered) to avoid player tag overlap at the bottom
  const maxWidth = Math.max(10, cardSize - 24)
  const maxHeight = Math.max(10, cardSize - 72)

  let minFontSize = 10
  let maxFontSize = maxHeight
  if (maxFontSize < minFontSize) maxFontSize = minFontSize

  let optimalSize = minFontSize

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  while (minFontSize <= maxFontSize) {
    const midSize = Math.floor((minFontSize + maxFontSize) / 2)
    context.font = `600 ${midSize}px "Outfit", sans-serif`

    let allFit = true
    for (const card of cards) {
      const text = card.textContent.trim()
      const metrics = context.measureText(text)
      
      if (metrics.width > maxWidth || midSize > maxHeight) {
        allFit = false
        break
      }
    }

    if (allFit) {
      optimalSize = midSize
      minFontSize = midSize + 1
    } else {
      maxFontSize = midSize - 1
    }
  }

  gameBoard.style.setProperty("--dynamic-word-size", `${optimalSize}px`)
}

// Expose debug variables to window
Object.defineProperty(window, "players", { get: () => players })
Object.defineProperty(window, "currentPlayerIndex", { get: () => currentPlayerIndex })
Object.defineProperty(window, "isDraggingEnabled", { get: () => isDraggingEnabled })
Object.defineProperty(window, "words", { get: () => words })
Object.defineProperty(window, "images", { get: () => images })
Object.defineProperty(window, "firstSelected", { get: () => firstSelected })
Object.defineProperty(window, "lockBoard", { get: () => lockBoard })
Object.defineProperty(window, "matchedPairs", { get: () => matchedPairs })
Object.defineProperty(window, "numPairs", { get: () => numPairs })
Object.defineProperty(window, "tries", { get: () => tries })
Object.defineProperty(window, "keepTurnOnMatch", { get: () => keepTurnOnMatch })
Object.defineProperty(window, "activeUnits", { get: () => activeUnits })
Object.defineProperty(window, "combinedUnitItems", { get: () => combinedUnitItems })

window.resetGame = resetGame
window.updatePlayerScores = updatePlayerScores
window.updatePlayerNames = updatePlayerNames
window.enablePlayerDragging = enablePlayerDragging
window.disablePlayerDragging = disablePlayerDragging
window.shufflePlayers = shufflePlayers
window.loadActiveUnits = loadActiveUnits
window.addActiveUnit = addActiveUnit
window.removeActiveUnit = removeActiveUnit
window.renderSelectedUnitsList = renderSelectedUnitsList
window.createCards = createCards
window.adjustGridSizing = adjustGridSizing
window.adjustCardWordFontSize = adjustCardWordFontSize
window.announceCurrentPlayerTurn = announceCurrentPlayerTurn

