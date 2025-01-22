import { cardLibrary } from "./cardLibrary.js"

const gameBoard = document.getElementById("game-board")
const pairsInput = document.getElementById("pairs-input")
const resetButton = document.getElementById("reset-button")
const triesDisplay = document.getElementById("tries-display")

resetButton.addEventListener("click", () => {
  resetGame()
  enablePlayerDragging()
})

let currentUnit = null
let currentBook = null
let currentSeries = null
let currentPlayerIndex = 0
let isDraggingEnabled = false
let firstSelected = null
let images = []
let lockBoard = false
let matchedPairs = 0
let maxPairs = 10
let minPairs = 2
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
    sound.addEventListener("ended", resolve, { once: true })
    sound.play().catch((error) => {
      console.error("Error playing sound:", error)
      resolve() // Resolve even on error to prevent hanging
    })
  })
}

function getRandomMatchColor() {
  const matchColors = [
    "matched-1",
    "matched-2",
    "matched-2",
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

  checkSessionExpiry()
  savePlayerStats()
}

function checkSessionExpiry() {
  const thirtyMinutes = 30 * 60 * 1000
  const now = Date.now()

  let shouldResetSession = false

  // Check if session is expired
  if (now - playerStats.sessionData.lastUpdated > thirtyMinutes) {
    shouldResetSession = true
  }

  // Check if player list changed
  const currentPlayers = players.map((p) => p.name)
  if (
    JSON.stringify(currentPlayers) !==
    JSON.stringify(playerStats.sessionData.players)
  ) {
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

    // Check if any player is in original position
    validShuffle = players.every(
      (player, index) => player !== originalOrder[index]
    )
    maxAttempts--
  }

  updatePlayerScores()
}

function enablePlayerDragging() {
  if (players.length < 2) return

  isDraggingEnabled = true
  const scoresDiv = document.getElementById("player-scores")

  // Show drag and shuffle buttons
  const dragBtn = document.getElementById("drag-btn")
  const shuffleBtn = document.getElementById("shuffle-btn")
  if (shuffleBtn) shuffleBtn.classList.add("visible")
  if (dragBtn) dragBtn.classList.add("visible")

  scoresDiv.querySelectorAll("div").forEach((div) => {
    div.draggable = true
    div.classList.add("draggable")

    div.addEventListener("dragstart", handleDragStart)
    div.addEventListener("dragover", handleDragOver)
    div.addEventListener("drop", handleDrop)
  })
}

function disablePlayerDragging() {
  isDraggingEnabled = false
  const scoresDiv = document.getElementById("player-scores")

  // Hide drag and shuffle buttons
  const dragBtn = document.getElementById("drag-btn")
  const shuffleBtn = document.getElementById("shuffle-btn")
  if (shuffleBtn) shuffleBtn.classList.remove("visible")
  if (dragBtn) dragBtn.classList.remove("visible")

  scoresDiv.querySelectorAll("div").forEach((div) => {
    div.draggable = false
    div.classList.remove("draggable")

    div.removeEventListener("dragstart", handleDragStart)
    div.removeEventListener("dragover", handleDragOver)
    div.removeEventListener("drop", handleDrop)
  })
}

function handleDragStart(e) {
  e.dataTransfer.setData("text/plain", e.target.dataset.playerName)
}

function handleDragOver(e) {
  e.preventDefault()
}

function handleDrop(e) {
  e.preventDefault()
  const draggedName = e.dataTransfer.getData("text/plain")
  const dropTarget = e.target.closest("div")

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

  const matchedItem = currentUnit.find(
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
  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search)
  const seriesParam = urlParams.get("series")
  const bookParam = urlParams.get("book")
  const unitParam = urlParams.get("unit")

  const selector = document.getElementById("unit-selector")
  selector.innerHTML = "" // Clear existing options

  const defaultOption = document.createElement("option")
  defaultOption.value = ""
  defaultOption.selected = true
  defaultOption.textContent = "Choose cards"
  selector.appendChild(defaultOption)

  const seperator = document.createElement("hr")
  selector.appendChild(seperator)

  let preselectedOption = null

  Object.keys(cardLibrary).forEach((series) => {
    const seriesGroup = document.createElement("optgroup")
    seriesGroup.label = series

    Object.keys(cardLibrary[series]).forEach((book) => {
      // Create a separator between books
      const separator = document.createElement("option")
      separator.textContent = `---`
      separator.disabled = true
      seriesGroup.appendChild(separator)

      Object.keys(cardLibrary[series][book]).forEach((unit) => {
        const option = document.createElement("option")
        option.value = `${series}|${book}|${unit}`
        option.textContent = `${book}: ${unit}`

        // Check if this option matches URL parameters
        if (
          series === seriesParam &&
          book === bookParam &&
          unit === unitParam
        ) {
          preselectedOption = option
          option.selected = true
        }

        seriesGroup.appendChild(option)
      })
    })

    selector.appendChild(seriesGroup)
  })

  selector.addEventListener("change", (e) => {
    const [series, book, unit] = e.target.value.split("|")

    // Update URL with new parameters
    const url = new URL(window.location)
    url.searchParams.set("series", series)
    url.searchParams.set("book", book)
    url.searchParams.set("unit", unit)
    window.history.pushState({}, "", url)

    loadUnit(series, book, unit)
  })

  // If an option was preselected, load that unit
  if (preselectedOption) {
    const [series, book, unit] = preselectedOption.value.split("|")
    loadUnit(series, book, unit)
  }
}

function createCards() {
  // console.log("Creating cards...")
  console.log("Words:", words)

  const numPairs = Math.min(maxPairs, words.length)

  // Randomly select words and their corresponding images
  const selectedIndices = []
  while (selectedIndices.length < numPairs) {
    const randomIndex = Math.floor(Math.random() * words.length)
    if (!selectedIndices.includes(randomIndex)) {
      selectedIndices.push(randomIndex)
    }
  }

  // Create arrays of selected words and images
  selectedWords = selectedIndices.map((index) => words[index])
  const selectedImages = selectedIndices.map((index) => images[index])

  let items = [...selectedWords, ...selectedImages]
  // console.log("Random words chosen:", selectedWords)

  // Randomly shuffle the array using a simple randomization sort method
  items = items.sort(() => 0.5 - Math.random())

  items.forEach((item, index) => {
    const card = document.createElement("div")
    card.classList.add("card", "hidden")
    card.style.setProperty("--index", index)
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
        if (currentBook === "1" && currentSeries === "Smart Phonics") {
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

    gameBoard.appendChild(card)
  })
}

function loadUnit(series, book, unit) {
  currentSeries = series
  currentBook = book
  currentUnit = cardLibrary[series][book][unit]

  // Separate words, images, and create sound map
  words = currentUnit.filter((item) => item.word).map((item) => item.word)
  images = currentUnit.filter((item) => item.image).map((item) => item.image)

  const originalWordLength = words.length
  const minWordLength = 7

  // Array to track how many times each word is duplicated
  const duplicateCounts = new Array(originalWordLength).fill(0)

  // If less than minWordLength, duplicate existing pairs to reach that number
  while (words.length < minWordLength) {
    // Find lowest duplicate count in tracking array
    const minDuplicates = Math.min(...duplicateCounts)

    // Create list of indices that have this minimum count
    const availableIndices = duplicateCounts
      .map((count, index) => (count === minDuplicates ? index : -1))
      .filter((index) => index !== -1)

    // Randomly select from these indices only
    const randomIndex =
      availableIndices[Math.floor(Math.random() * availableIndices.length)]

    // Add the randomly selected word and its corresponding image
    words.push(words[randomIndex])
    images.push(images[randomIndex])
    duplicateCounts[randomIndex]++
  }

  soundMap = preloadSoundsArray(currentUnit)
  targetLetters = currentUnit[0].targetLetters

  // Update pairs input max attribute based on available pairs
  const availablePairs = Math.max(minWordLength, originalWordLength)

  pairsInput.max = availablePairs
  pairsInput.min = minPairs

  // const pairsInputDefaultValue = 5
  pairsInput.value = Math.min(maxPairs, availablePairs)

  // Reset the game with new words and images
  resetGame()
  enablePlayerDragging()
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
  updatePlayerScores()
  updateScore()
  createCards()
}

function resetTurn() {
  firstSelected.classList.remove("revealed")
  firstSelected.classList.add("hidden")
  firstSelected = null
  lockBoard = false
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
  players = names.map((name) => ({ name, score: 0 }))
  currentPlayerIndex = 0
  initializePlayerStats()
  updatePlayerScores()
  enablePlayerDragging()
  addPlayersButton.textContent = "Update Players"

  return true
}

// Load saved names when the page loads
function loadSavedPlayerNames() {
  const savedInput = localStorage.getItem("playerNamesInput")
  if (savedInput) {
    const playerNameInput = document.getElementById("player-names-input")
    playerNameInput.value = savedInput
  }
}

function updateScore() {
  triesDisplay.textContent = `Tries: ${tries}`
}

function updatePlayerScores() {
  if (players.length === 0) return

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
      playerScore.textContent = `${player.name}: ${player.score}`
      playerScore.className =
        index === currentPlayerIndex ? "current-player" : ""
      scoresDiv.appendChild(playerScore)
    })

    if (document.querySelector(".draggable")) {
      enablePlayerDragging()
    }
  } else {
    players.forEach((player, index) => {
      const playerElement = scoresDiv.querySelector(
        `[data-player-name="${player.name}"]`
      )
      if (playerElement) {
        playerElement.textContent = `${player.name}: ${player.score}`
        // Preserve draggable class if present
        const wasDraggable = playerElement.classList.contains("draggable")
        playerElement.className =
          index === currentPlayerIndex ? "current-player" : ""
        if (wasDraggable) {
          playerElement.classList.add("draggable")
        }
        scoresDiv.appendChild(playerElement)
      }
    })
  }
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
    statsDiv.appendChild(
      createStatsTable("All-Time Stats", sortedPlayers, "allTime")
    )

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

    // Hide reordering buttons on first card click
    if (isDraggingEnabled) {
      disablePlayerDragging()
    }

    clicked.classList.remove("hidden")
    clicked.classList.add("revealed")

    // Get the clicked content (word or image path)
    const clickedContent = clicked.dataset.content

    // Find the corresponding item in currentUnit
    const soundItem = currentUnit.find(
      (item) => item.word === clickedContent || item.image === clickedContent
    )

    if (soundItem) {
      lockBoard = true
      const isImageCard = clickedContent.includes(".jpg")

      // For Smart Phonics 1, images and words have different sounds
      if (
        currentBook === "1" &&
        currentSeries === "Smart Phonics" &&
        isImageCard
      ) {
        // Play the image vocabulary sound
        const imgSound = new Audio(soundItem.imageSound)
        await playSound(imgSound)
      } else {
        // Play the regular sound
        await playSound(soundMap[soundItem.word])
      }

      lockBoard = false
    }

    if (!firstSelected) {
      firstSelected = clicked
    } else {
      lockBoard = true // Prevent more clicks until this check is done
      tries++
      updateScore()
      if (isMatch(firstSelected, clicked)) {
        // Play match sound
        playSound(matchSound)
        firstSelected = null
        lockBoard = false
        matchedPairs += 1 // Increment the matched pair count
        updateStatsForMatch(players[currentPlayerIndex].name)

        // Check if the game is complete
        if (matchedPairs === selectedWords.length) {
          // Play completion sound
          playSound(completeSound)
          showCompletionModal(tries)
        }
      } else {
        // Reset the sound to the beginning, so it plays if a match is tried quickly
        wrongSound.currentTime = 0
        playSound(wrongSound)
        // Delay to allow users to see the cards
        // setTimeout(() => {
        firstSelected.classList.remove("revealed")
        firstSelected.classList.add("hidden")
        clicked.classList.remove("revealed")
        clicked.classList.add("hidden")

        firstSelected = null
        lockBoard = false
        // }, 1000)
      }
      // change to next player
      currentPlayerIndex = (currentPlayerIndex + 1) % players.length
      updatePlayerScores()
    }
  }
})

// Add event listener for the max Matches input
pairsInput.addEventListener("change", (e) => {
  const value = parseInt(e.target.value)
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
})

// Allow clicking outside the modal to close it
document.getElementById("completion-modal").addEventListener("click", (e) => {
  if (e.target.id === "completion-modal") {
    hideCompletionModal()
  }
})

document.addEventListener("DOMContentLoaded", () => {
  // Add event listener for update players button
  document.getElementById("add-players-btn").addEventListener("click", () => {
    if (updatePlayerNames()) {
      resetGame()
    }
  })

  document
    .getElementById("shuffle-btn")
    .addEventListener("click", shufflePlayers)
  document
    .getElementById("drag-btn")
    .addEventListener("click", disablePlayerDragging)

  loadSavedPlayerNames()
  createUnitSelector()
})
