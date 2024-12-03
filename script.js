import { cardLibrary } from "./cardLibrary.js"

const gameBoard = document.getElementById("game-board")
const pairsInput = document.getElementById("pairs-input")
const resetButton = document.getElementById("reset-button")
const triesDisplay = document.getElementById("tries-display")

resetButton.addEventListener("click", resetGame)

let currentUnit = null
let currentBook = null
let currentSeries = null
let currentPlayerIndex = 0
let firstSelected = null
let images = []
let lockBoard = false
let matchedPairs = 0
let maxPairs = 6
let players = []
let selectedWords = []
let soundMap = {}
let tries = 0
let usedMatchColors = []
let words = []

// Function to preload audio
function preloadSoundsArray(items) {
  return items.reduce((acc, item) => {
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

// Preload sound files
const matchSound = preloadSingleSound("data/soundfx/match-sound.mp3")
const completeSound = preloadSingleSound("data/soundfx/complete-sound.mp3")
const wrongSound = preloadSingleSound("data/soundfx/wrong-sound.mp3")

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

  // For all books except Book1, use the original exact matching
  if (!currentBook || currentBook !== "1") {
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

  // Book1 special matching logic
  const isFirstImage = firstContent.includes(".jpg")
  const isSecondImage = secondContent.includes(".jpg")

  // Make sure one is image and one is letter
  if (isFirstImage === isSecondImage) return false

  const imagePath = isFirstImage ? firstContent : secondContent
  const letter = isFirstImage ? secondContent : firstContent

  // Extract the image name from the path
  const imageName = imagePath.split("/").pop().split(".")[0] // gets 'dog' from path
  // Check if the letter card is a double-letter format (like 'Aa', 'Bb', etc.)
  const isDoubleLetterFormat = /^[A-Z][a-z]$/.test(letter)
  if (!isDoubleLetterFormat) return false

  // Get the first letter of the image name and the first letter of the double-letter card
  const imageFirstLetter = imageName[0].toLowerCase()
  const letterCardFirstLetter = letter[0].toLowerCase()

  // Check if they match
  if (imageFirstLetter === letterCardFirstLetter) {
    const matchColor = getRandomMatchColor()
    first.classList.add("matched", matchColor)
    second.classList.add("matched", matchColor)
    addPlayerTagsAndUpdateScore(first, second)
    return true
  }

  return false
}

function updateScore() {
  triesDisplay.textContent = `Tries: ${tries}`
}

// Function to load a specific unit
function loadPhonicsUnit(series, book, unit) {
  currentSeries = series
  currentBook = book
  currentUnit = cardLibrary[series][book][unit]

  // Separate words, images, and create sound map
  words = currentUnit.map((item) => item.word)
  images = currentUnit.map((item) => item.image)
  soundMap = preloadSoundsArray(currentUnit)

  // Update pairs input max attribute based on available pairs
  const availablePairs = currentUnit.length
  pairsInput.max = availablePairs
  pairsInput.value = Math.min(maxPairs, availablePairs)

  // Reset the game with new words and images
  resetGame()
}

// Add a dropdown or buttons to select units
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
      // const line = document.createElement("option")
      // line.textContent = "─────"
      // seriesGroup.appendChild(line)
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

    loadPhonicsUnit(series, book, unit)
  })

  // If an option was preselected, load that unit
  if (preselectedOption) {
    const [series, book, unit] = preselectedOption.value.split("|")
    loadPhonicsUnit(series, book, unit)
  }
}

function createCards() {
  // console.log("Creating cards...")
  // console.log("Words:", words)

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
      wordContainer.textContent = item
      card.appendChild(wordContainer)
    }

    gameBoard.appendChild(card)
  })
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
  const input = document.getElementById("player-names-input").value
  // Split by comma or newline and clean up whitespace
  const names = input
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

  // Update players array
  players = names.map((name) => ({ name, score: 0 }))
  currentPlayerIndex = 0
  updatePlayerScores()
  return true
}

function updatePlayerScores() {
  if (players.length > 0) {
    const scoresDiv = document.getElementById("player-scores")
    scoresDiv.innerHTML = ""
    scoresDiv.style.display = "flex"

    players.forEach((player, index) => {
      const playerScore = document.createElement("div")
      playerScore.className =
        index === currentPlayerIndex ? "current-player" : ""
      playerScore.textContent = `${player.name}: ${player.score}`
      scoresDiv.appendChild(playerScore)
    })
  }
}

gameBoard.addEventListener("click", async function (event) {
  const target = event.target
  if (target instanceof HTMLElement) {
    const clicked = target.closest(".card")
    if (!clicked || clicked.classList.contains("revealed") || lockBoard) return

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

      // Determine which sound to play based on whether it's a word or image card
      if (currentBook === "1" && currentSeries === "Smart Phonics") {
        const isImageCard = clickedContent.includes(".jpg")
        if (isImageCard) {
          // Play the image vocabulary sound
          const imgSound = new Audio(soundItem.imageSound)
          await playSound(imgSound)
        } else {
          // Play the letter sound
          await playSound(soundMap[soundItem.word])
        }
      } else {
        // For other books, play the regular sound
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

  // Ensure value is within bounds
  if (value < 2) {
    e.target.value = 2
    maxPairs = 2
  } else if (value > parseInt(e.target.max)) {
    e.target.value = e.target.max
    maxPairs = parseInt(e.target.max)
  } else {
    maxPairs = value
  }

  resetGame()
})

function showCompletionModal(tries) {
  const modal = document.getElementById("completion-modal")
  const finalScore = document.getElementById("final-score")
  const modalScores = document.getElementById("modal-player-scores")
  finalScore.textContent = tries

  // Only show player scores if players array exists and has entries
  if (players && players.length > 0) {
    // Clear and update modal scores
    modalScores.innerHTML = ""

    // Sort players by score in descending order
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

    // Get the highest score
    const highestScore = sortedPlayers[0].score

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

// Add event listener for the Play Again button
document.getElementById("play-again-btn").addEventListener("click", () => {
  hideCompletionModal()
  resetGame()
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

  createUnitSelector()
  // updatePlayerNames() // Initialize player inputs
  // loadPhonicsUnit("Smart Phonics", "1", "Unit 4")
})
