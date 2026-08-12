"use strict";


/* ==========================================================
   JQUIZ
   Main application logic
   ========================================================== */


/* ----------------------------------------------------------
   DATA LOCATION
   ---------------------------------------------------------- */

/*
 * The Python exporter creates this file.
 *
 * It tells the browser:
 *
 * - how many clues exist
 * - what topics exist
 * - how many clues belong to each topic
 * - where each topic's JSON file is located
 */

const MANIFEST_URL = "data/manifest.json";


/* ----------------------------------------------------------
   PAGE ELEMENTS
   ---------------------------------------------------------- */

const topicList =
    document.querySelector("#topic-list");

const topicSearch =
    document.querySelector("#topic-search");

const clearTopicsButton =
    document.querySelector("#clear-topics");

const selectionSummary =
    document.querySelector("#selection-summary");

const categoryText =
    document.querySelector("#category-text");

const clueText =
    document.querySelector("#clue-text");

const clueCard =
    document.querySelector("#clue-card");

const answerPanel =
    document.querySelector("#answer-panel");

const responseText =
    document.querySelector("#response-text");

const clueValue =
    document.querySelector("#clue-value");

const newClueButton =
    document.querySelector("#new-clue");

const statusMessage =
    document.querySelector("#status-message");


/* ----------------------------------------------------------
   APPLICATION STATE
   ---------------------------------------------------------- */

/*
 * The manifest is loaded once when the page starts.
 */

let manifest = null;


/*
 * Stores the clue currently shown on screen.
 */

let currentClue = null;


/*
 * Topic files are downloaded only when needed.
 *
 * Once a topic has been downloaded, we keep it in memory
 * so another clue from the same topic is instant.
 */

const topicCache = new Map();


/* ----------------------------------------------------------
   NUMBER FORMATTING
   ---------------------------------------------------------- */

const numberFormatter =
    new Intl.NumberFormat("en-US");


function formatNumber(number) {
    return numberFormatter.format(number);
}


/* ----------------------------------------------------------
   MANIFEST VALIDATION
   ---------------------------------------------------------- */

function validateManifest(data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        throw new Error(
            "manifest.json does not contain a valid object."
        );
    }


    if (
        !Number.isInteger(data.totalClues) ||
        data.totalClues < 1
    ) {
        throw new Error(
            "manifest.json does not contain a valid totalClues value."
        );
    }


    if (
        !Array.isArray(data.topics) ||
        data.topics.length === 0
    ) {
        throw new Error(
            "manifest.json does not contain a valid topics list."
        );
    }


    for (const topic of data.topics) {

        if (
            !topic ||
            typeof topic !== "object"
        ) {
            throw new Error(
                "manifest.json contains an invalid topic entry."
            );
        }


        if (
            typeof topic.name !== "string" ||
            topic.name.trim() === ""
        ) {
            throw new Error(
                "A topic in manifest.json has an invalid name."
            );
        }


        if (
            !Number.isInteger(topic.count) ||
            topic.count < 1
        ) {
            throw new Error(
                `Topic "${topic.name}" has an invalid clue count.`
            );
        }


        if (
            typeof topic.file !== "string" ||
            topic.file.trim() === ""
        ) {
            throw new Error(
                `Topic "${topic.name}" has an invalid file path.`
            );
        }

    }

}


/* ----------------------------------------------------------
   TOPIC CHECKBOXES
   ---------------------------------------------------------- */

/*
 * The HTML does not contain 104 hard-coded checkboxes.
 *
 * Instead, this function reads the topics from manifest.json
 * and creates the checkbox list automatically.
 */

function createTopicOptions() {

    topicList.innerHTML = "";


    manifest.topics.forEach(
        (topic, topicIndex) => {

            const label =
                document.createElement("label");

            label.className =
                "topic-option";


            /*
             * Save a lowercase version for topic searching.
             */

            label.dataset.searchText =
                topic.name.toLocaleLowerCase();


            const input =
                document.createElement("input");

            input.type =
                "checkbox";

            input.name =
                "topic";

            input.value =
                String(topicIndex);

            input.id =
                `topic-${topicIndex}`;


            const text =
                document.createElement("span");

            text.className =
                "topic-option-text";

            text.textContent =
                topic.name;


            label.append(
                input,
                text
            );


            topicList.append(
                label
            );


            /*
             * Changing a checkbox changes which clues will
             * be eligible for the NEXT random clue.
             */

            input.addEventListener(
                "change",
                announceTopicSelection
            );

        }
    );

}


/* ----------------------------------------------------------
   SELECTED TOPICS
   ---------------------------------------------------------- */

/*
 * Return the manifest indexes of all checked topics.
 *
 * Example:
 *
 * [0, 4, 17]
 *
 * An empty array has a special meaning:
 *
 * use EVERY topic.
 */

function getSelectedTopicIndexes() {

    return [
        ...document.querySelectorAll(
            'input[name="topic"]:checked'
        )
    ].map(
        (input) =>
            Number(input.value)
    );

}


/*
 * Convert selected indexes into the corresponding
 * manifest topic objects.
 *
 * If nothing is selected, every topic is eligible.
 */

function getEligibleTopics() {

    const selectedIndexes =
        getSelectedTopicIndexes();


    if (selectedIndexes.length === 0) {
        return manifest.topics;
    }


    return selectedIndexes
        .map(
            (index) =>
                manifest.topics[index]
        )
        .filter(Boolean);

}


/* ----------------------------------------------------------
   TOTAL ELIGIBLE CLUES
   ---------------------------------------------------------- */

function countEligibleClues(
    eligibleTopics
) {

    return eligibleTopics.reduce(
        (total, topic) =>
            total + topic.count,
        0
    );

}


/* ----------------------------------------------------------
   RANDOM CLUE SELECTION
   ---------------------------------------------------------- */

/*
 * We want every individual clue to have an equal chance.
 *
 * We therefore DO NOT:
 *
 * 1. randomly choose a topic
 * 2. randomly choose a clue inside that topic
 *
 * That would make small topics disproportionately likely.
 *
 * Instead, imagine all eligible topics joined into one
 * enormous array and randomly choose one position in it.
 */

function chooseRandomCluePosition(
    eligibleTopics
) {

    const totalEligibleClues =
        countEligibleClues(
            eligibleTopics
        );


    if (totalEligibleClues === 0) {

        throw new Error(
            "No clues are available for the selected topics."
        );

    }


    /*
     * Example:
     *
     * If 1,885 clues are eligible,
     * this produces an integer from 0 through 1,884.
     */

    let randomPosition =
        Math.floor(
            Math.random() *
            totalEligibleClues
        );


    for (const topic of eligibleTopics) {

        /*
         * If the position falls inside this topic,
         * randomPosition is also the clue's array index
         * within that topic JSON file.
         */

        if (
            randomPosition <
            topic.count
        ) {

            return {
                topic,
                clueIndex:
                    randomPosition,
                totalEligibleClues
            };

        }


        /*
         * Otherwise move past this topic's block
         * and continue to the next one.
         */

        randomPosition -=
            topic.count;

    }


    /*
     * We should never get here unless the manifest
     * contains inconsistent data.
     */

    throw new Error(
        "The app could not determine a random clue position."
    );

}


/* ----------------------------------------------------------
   LOAD ONE TOPIC FILE
   ---------------------------------------------------------- */

/*
 * Download one topic's JSON file.
 *
 * The result is cached, so a topic file is normally
 * downloaded only once during the browser session.
 */

async function loadTopicFile(
    topic
) {

    const cacheKey =
        topic.file;


    if (
        topicCache.has(
            cacheKey
        )
    ) {

        return topicCache.get(
            cacheKey
        );

    }


    /*
     * The exporter gives the manifest a new version whenever
     * the spreadsheet is regenerated.
     *
     * Adding that version to the URL helps prevent browsers
     * from continuing to use an old topic file.
     */

    const version =
        encodeURIComponent(
            manifest.version ||
            "current"
        );


    const separator =
        topic.file.includes("?")
            ? "&"
            : "?";


    const fileUrl =
        `${topic.file}${separator}v=${version}`;


    /*
     * Store the Promise immediately.
     *
     * This avoids duplicate downloads if two requests for
     * the same file somehow happen at nearly the same time.
     */

    const loadingPromise =
        fetch(fileUrl)

            .then(
                (response) => {

                    if (
                        !response.ok
                    ) {

                        throw new Error(
                            `Could not load topic "${topic.name}". ` +
                            `The server returned ${response.status}.`
                        );

                    }


                    return response.json();

                }
            )

            .then(
                (clues) => {

                    if (
                        !Array.isArray(
                            clues
                        )
                    ) {

                        throw new Error(
                            `Topic "${topic.name}" does not contain a valid clue array.`
                        );

                    }


                    if (
                        clues.length !==
                        topic.count
                    ) {

                        throw new Error(
                            `Topic "${topic.name}" should contain ` +
                            `${formatNumber(topic.count)} clues, ` +
                            `but its file contains ` +
                            `${formatNumber(clues.length)}.`
                        );

                    }


                    return clues;

                }
            );


    topicCache.set(
        cacheKey,
        loadingPromise
    );


    try {

        return await loadingPromise;

    } catch (error) {

        /*
         * If a download fails, remove the failed Promise
         * so a later attempt can try again.
         */

        topicCache.delete(
            cacheKey
        );

        throw error;

    }

}


/* ----------------------------------------------------------
   CONVERT COMPACT JSON RECORD
   ---------------------------------------------------------- */

/*
 * Topic JSON records use this compact format:
 *
 * [
 *     clue value,
 *     category,
 *     clue,
 *     response
 * ]
 */

function createClueObject(
    record,
    topic
) {

    if (
        !Array.isArray(record) ||
        record.length < 4
    ) {

        throw new Error(
            `A clue in topic "${topic.name}" ` +
            "does not have the expected format."
        );

    }


    const [
        value,
        category,
        clue,
        response
    ] = record;


    return {
        topic:
            topic.name,

        value:
            String(value),

        category:
            String(category),

        clue:
            String(clue),

        response:
            String(response)
    };

}


/* ----------------------------------------------------------
   HIDE RESPONSE
   ---------------------------------------------------------- */

function hideResponse() {

    answerPanel.hidden =
        true;


    responseText.textContent =
        "";


    clueValue.textContent =
        "";


    clueCard.setAttribute(
        "aria-expanded",
        "false"
    );


    clueCard.setAttribute(
        "aria-label",
        "Reveal response for current clue"
    );

}


/* ----------------------------------------------------------
   LOADING STATE
   ---------------------------------------------------------- */

function beginClueLoading() {

    currentClue =
        null;


    newClueButton.disabled =
        true;


    answerPanel.hidden =
        true;


    responseText.textContent =
        "";


    clueValue.textContent =
        "";


    categoryText.textContent =
        "Loading";


    clueText.textContent =
        "Selecting a random clue...";


    statusMessage.textContent =
        "Loading clue data...";


    statusMessage.classList.remove(
        "is-error",
        "is-success"
    );

}


/* ----------------------------------------------------------
   DISPLAY CLUE
   ---------------------------------------------------------- */

function displayClue(
    clue
) {

    currentClue =
        clue;


    categoryText.textContent =
        clue.category;


    clueText.textContent =
        clue.clue;


    hideResponse();

}


/* ----------------------------------------------------------
   SELECTION STATUS
   ---------------------------------------------------------- */

function createSelectionStatus(
    eligibleTopics,
    totalEligibleClues
) {

    const selectedIndexes =
        getSelectedTopicIndexes();


    /*
     * Nothing checked = use the entire database.
     */

    if (
        selectedIndexes.length === 0
    ) {

        return (
            `Randomized from all ` +
            `${formatNumber(totalEligibleClues)} clues ` +
            `across ${formatNumber(eligibleTopics.length)} topics.`
        );

    }


    const topicWord =
        eligibleTopics.length === 1
            ? "topic"
            : "topics";


    return (
        `Randomized from ` +
        `${formatNumber(totalEligibleClues)} clues ` +
        `across ${formatNumber(eligibleTopics.length)} ` +
        `${topicWord}.`
    );

}


/* ----------------------------------------------------------
   SHOW A NEW RANDOM CLUE
   ---------------------------------------------------------- */

async function showNewClue() {

    if (!manifest) {
        return;
    }


    const eligibleTopics =
        getEligibleTopics();


    if (
        eligibleTopics.length === 0
    ) {

        currentClue =
            null;


        categoryText.textContent =
            "No Clues Available";


        clueText.textContent =
            "No clues match the current topic selection.";


        answerPanel.hidden =
            true;


        statusMessage.textContent =
            "Choose a different topic.";


        statusMessage.classList.add(
            "is-error"
        );


        return;

    }


    beginClueLoading();


    try {

        /*
         * Choose an exact position from the complete
         * eligible clue pool.
         */

        const selection =
            chooseRandomCluePosition(
                eligibleTopics
            );


        /*
         * Download the selected topic's data file
         * if it has not already been cached.
         */

        const topicClues =
            await loadTopicFile(
                selection.topic
            );


        /*
         * Pull the selected clue from that topic.
         */

        const record =
            topicClues[
                selection.clueIndex
            ];


        const clue =
            createClueObject(
                record,
                selection.topic
            );


        displayClue(
            clue
        );


        statusMessage.textContent =
            createSelectionStatus(
                eligibleTopics,
                selection.totalEligibleClues
            );


    } catch (error) {

        console.error(
            error
        );


        currentClue =
            null;


        categoryText.textContent =
            "Could Not Load Clue";


        clueText.textContent =
            "The clue data could not be loaded.";


        answerPanel.hidden =
            true;


        statusMessage.textContent =
            error instanceof Error
                ? error.message
                : "An unknown data error occurred.";


        statusMessage.classList.add(
            "is-error"
        );


    } finally {

        newClueButton.disabled =
            false;

    }

}


/* ----------------------------------------------------------
   REVEAL RESPONSE
   ---------------------------------------------------------- */

function revealResponse() {

    if (!currentClue) {
        return;
    }


    /*
     * If the response is already visible,
     * clicking the card again does nothing.
     */

    if (!answerPanel.hidden) {
        return;
    }


    responseText.textContent =
        currentClue.response;


    clueValue.textContent =
        currentClue.value;


    answerPanel.hidden =
        false;


    clueCard.setAttribute(
        "aria-expanded",
        "true"
    );


    clueCard.setAttribute(
        "aria-label",
        "Response revealed"
    );

}


/* ----------------------------------------------------------
   SELECTION SUMMARY
   ---------------------------------------------------------- */

function announceTopicSelection() {

    if (!manifest) {
        return;
    }


    const selectedIndexes =
        getSelectedTopicIndexes();


    /*
     * No topics selected means everything is eligible.
     */

    if (
        selectedIndexes.length === 0
    ) {

        selectionSummary.textContent =
            `All ${formatNumber(manifest.totalClues)} clues ` +
            `across ${formatNumber(manifest.topics.length)} topics ` +
            `are eligible.`;

        return;

    }


    const eligibleTopics =
        getEligibleTopics();


    const eligibleCount =
        countEligibleClues(
            eligibleTopics
        );


    const topicWord =
        eligibleTopics.length === 1
            ? "topic"
            : "topics";


    const clueWord =
        eligibleCount === 1
            ? "clue"
            : "clues";


    selectionSummary.textContent =
        `${formatNumber(eligibleCount)} ${clueWord} ` +
        `available across ` +
        `${formatNumber(eligibleTopics.length)} ${topicWord}.`;

}


/* ----------------------------------------------------------
   CLEAR TOPIC SELECTIONS
   ---------------------------------------------------------- */

function clearTopicSelections() {

    const topicInputs = [
        ...document.querySelectorAll(
            'input[name="topic"]'
        )
    ];


    topicInputs.forEach(
        (input) => {

            input.checked =
                false;

        }
    );


    announceTopicSelection();

}


/* ----------------------------------------------------------
   TOPIC SEARCH
   ---------------------------------------------------------- */

/*
 * Searching does NOT change which topics are selected.
 *
 * It only hides topic names that do not match the text
 * in the search field.
 */

function filterTopicList() {

    const searchText =
        topicSearch.value
            .trim()
            .toLocaleLowerCase();


    const topicOptions = [
        ...topicList.querySelectorAll(
            ".topic-option"
        )
    ];


    topicOptions.forEach(
        (option) => {

            const topicText =
                option.dataset.searchText ||
                "";


            const matches =
                searchText === "" ||
                topicText.includes(
                    searchText
                );


            option.classList.toggle(
                "is-filtered-out",
                !matches
            );

        }
    );

}


/* ----------------------------------------------------------
   INITIALIZE APPLICATION
   ---------------------------------------------------------- */

async function initializeApplication() {

    newClueButton.disabled =
        true;

    topicSearch.disabled =
        true;


    clearTopicsButton.disabled =
        true;


    categoryText.textContent =
        "Loading";


    clueText.textContent =
        "Loading your clue database...";


    selectionSummary.textContent =
        "Loading clue database...";


    statusMessage.textContent =
        "Loading clue database...";


    try {

        /*
         * Always request a fresh copy of the small manifest.
         *
         * Individual topic files can still be cached after
         * their first successful download.
         */

        const response =
            await fetch(
                MANIFEST_URL,
                {
                    cache: "no-store"
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `Could not load manifest.json. ` +
                `The server returned ${response.status}.`
            );

        }


        const loadedManifest =
            await response.json();


        validateManifest(
            loadedManifest
        );


        manifest =
            loadedManifest;


        /*
         * Create all topic checkboxes from manifest.json.
         */

        createTopicOptions();


        /*
         * Enable topic controls.
         */

        topicSearch.disabled =
            false;


        clearTopicsButton.disabled =
            false;


        /*
         * Display the initial clue count.
         */

        announceTopicSelection();


        newClueButton.disabled =
            false;


        /*
         * Your requested default behavior:
         *
         * Immediately display one completely random clue
         * when the webpage first opens.
         *
         * Since no topics are selected at startup,
         * every clue is eligible.
         */

        await showNewClue();


    } catch (error) {

        console.error(
            error
        );


        manifest =
            null;


        topicList.innerHTML =
            '<p class="loading-message">Topics could not be loaded.</p>';


        categoryText.textContent =
            "Database Error";


        clueText.textContent =
            "The application could not load the clue database.";


        selectionSummary.textContent =
            "Clue database unavailable.";


        statusMessage.textContent =
            error instanceof Error
                ? error.message
                : "An unknown startup error occurred.";


        statusMessage.classList.add(
            "is-error"
        );


        newClueButton.disabled =
            true;

    }

}


/* ----------------------------------------------------------
   EVENT LISTENERS
   ---------------------------------------------------------- */

newClueButton.addEventListener(
    "click",
    showNewClue
);

clueCard.addEventListener(
    "click",
    revealResponse
);

clueCard.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter" ||
            event.key === " "
        ) {

            event.preventDefault();

            revealResponse();

        }

    }
);

clearTopicsButton.addEventListener(
    "click",
    clearTopicSelections
);

topicSearch.addEventListener(
    "input",
    filterTopicList
);


/* ----------------------------------------------------------
   START APPLICATION
   ---------------------------------------------------------- */

initializeApplication();