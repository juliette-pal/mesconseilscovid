var pagination = require('./pagination.js')
var affichage = require('./affichage.js')

class Updater {
    constructor(router) {
        this.router = router
        this.currentVersion = null
        this.updateInProgress = false
    }

    checkForUpdatesEvery(intervalInMinutes) {
        this.checkForUpdate()
        setInterval(this.checkForUpdate.bind(this), intervalInMinutes * 60 * 1000)
    }

    checkForUpdate() {
        if (this.updateInProgress === true) {
            return
        }

        const pageName = pagination.getCurrentPageName()
        if (pageName === 'nouvelleversiondisponible') {
            return
        }

        const xhr = new XMLHttpRequest()
        xhr.open('GET', 'version.json?' + new Date().getTime(), true)
        xhr.setRequestHeader('Cache-Control', 'no-cache')
        xhr.onload = () => {
            if (xhr.status === 200) {
                const jsonResponse = JSON.parse(xhr.responseText)
                this.updateVersion(jsonResponse.version)
            } else {
                console.debug('Impossible de récupérer les informations de mise à jour')
            }
        }
        xhr.onerror = () => {
            console.debug('Impossible de récupérer les informations de mise à jour')
        }
        xhr.send()
    }

    showBanner(document) {
        const block = document.querySelector('#update-banner')
        affichage.showElement(block)
        document.dispatchEvent(new CustomEvent('show-banner', { detail: block }))
    }

    updateFooter(fetchedVersion) {
        if (this.currentVersion !== fetchedVersion) {
            const element = document.querySelector('.js-latest-update')
            const readableVersion = fetchedVersion.split('-').reverse().join('-')
            element.innerText = ` - Mis à jour le : ${readableVersion}.`
        }
    }

    updateVersion(fetchedVersion) {
        this.updateFooter(fetchedVersion)

        if (this.currentVersion === null || this.currentVersion === fetchedVersion) {
            this.currentVersion = fetchedVersion
            return
        }

        this.updateInProgress = true

        // Update service worker first
        if ('serviceWorker' in navigator) {
            console.debug('Service worker supported')
            navigator.serviceWorker.getRegistration().then((registration) => {
                console.debug('Telling service worker to look for an update')
                registration.update().catch((err) => {
                    console.error('Mise à jour du service worker impossible :', err)
                })
                registration.addEventListener('updatefound', () => {
                    console.debug('Service worker update found')
                    const newWorker = registration.installing
                    newWorker.addEventListener('statechange', () => {
                        console.debug('New service worker state:', newWorker.state)
                        if (newWorker.state == 'installed') {
                            this.notifyUser()
                        }
                    })
                })
            })
        } else {
            console.debug('Service worker NOT supported')
            this.notifyUser()
        }
    }

    notifyUser() {
        const pageName = pagination.getCurrentPageName()
        if (this.isFillingQuestionnaire()) {
            this.notifyUserWithoutInterrupting(pageName)
        } else {
            this.redirectUserToUpdatePage(pageName)
        }
    }

    isFillingQuestionnaire() {
        const pageName = pagination.getCurrentPageName()
        return (
            pageName === 'residence' ||
            pageName === 'activitepro' ||
            pageName === 'foyer' ||
            pageName === 'caracteristiques' ||
            pageName === 'antecedents' ||
            pageName === 'symptomesactuels' ||
            pageName === 'symptomespasses' ||
            pageName === 'contactarisque'
        )
    }

    notifyUserWithoutInterrupting(pageName) {
        document.addEventListener('show-banner', (event) => {
            // Even with an event, we need to wait for the next few
            // ticks to be able to scroll to the newly visible element.
            setTimeout(() => {
                event.detail.scrollIntoView({ behavior: 'smooth' })
            }, 100)
            const refreshButton = event.detail.querySelector('#refresh-button-banner')
            this.setupRefreshButton(refreshButton, pageName)
        })
        this.showBanner(document)
    }

    redirectUserToUpdatePage(pageName) {
        this.router.navigate(`nouvelleversiondisponible?origine=${pageName}`)
    }

    setupRefreshButton(button, pageName) {
        button.innerText = 'Mettre à jour'
        button.setAttribute('href', '#' + (pageName || 'introduction'))
        button.addEventListener('click', this.onClickRefreshButton.bind(this))
    }

    onClickRefreshButton(event) {
        console.debug('Updater.onClickRefreshButton()')
        event.preventDefault()

        let button = event.target

        // Change the URL without triggering the router
        this.router.pause()
        console.log(window.location)
        window.location = button.href
        console.log(window.location)

        // User feedback as it may take more than a few milliseconds
        button.innerText = 'Mise à jour en cours...'
        button.setAttribute('href', '')

        if ('serviceWorker' in navigator) {
            // Tell new service worker to activate now
            navigator.serviceWorker.getRegistration().then((registration) => {
                if (registration.waiting === null) {
                    console.debug('New service worker is already active')
                    console.debug('Reloading the page')
                    window.location.reload(true) // `true` means: reload from server.
                } else {
                    console.debug('New service worker is waiting')
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        console.debug('New service worker is now controlling the page')
                        console.debug('Reloading the page')
                        window.location.reload(true) // `true` means: reload from server.
                    })

                    console.debug('Sending message to activate new service worker')
                    registration.waiting.postMessage('skipWaiting')
                }
            })
        } else {
            console.debug('Browser does not support service workers')
            console.debug('Reloading the page')
            window.location.reload(true) // `true` means: reload from server.
        }
    }
}

module.exports = {
    Updater,
}