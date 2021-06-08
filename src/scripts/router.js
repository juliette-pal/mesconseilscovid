import Navigo from 'navigo'

import { hideElement, showElement } from './affichage'
import { nomProfil } from './injection'
import { getCurrentPageName, loadPage } from './pagination'
import { titleCase } from './utils'

import introduction from './page/introduction'

import nouvelleversion from './page/nouvelleversion'

import nom from './page/questionnaire/nom'

import vaccins from './page/questionnaire/vaccins'
import historique from './page/questionnaire/historique'
import symptomes from './page/questionnaire/symptomes'
import depistage from './page/questionnaire/depistage'
import contactarisque from './page/questionnaire/contactarisque'
import situation from './page/questionnaire/situation'
import sante from './page/questionnaire/sante'
import conseils from './page/conseils'

import suiviintroduction from './page/suiviintroduction'
import suivisymptomes from './page/suivisymptomes'
import suivihistorique from './page/suivihistorique'

import {
    beforeConseils,
    beforeSuiviIntroduction,
    beforeSuiviSymptomes,
    beforeSuiviHistorique,
} from './questionnaire'

class Router {
    constructor(app) {
        this.app = app
        this.initialTitle = document.title

        this.navigo = this.initNavigo()

        this.setupGlobalHooks()

        this.addAppRoute('introduction', introduction, undefined, '') // accueil : pas de titre

        this.addAppRoute('nom', nom)

        this.addQuestionnaireRoute('vaccins', vaccins)
        this.addQuestionnaireRoute('historique', historique)
        this.addQuestionnaireRoute('symptomes', symptomes)
        this.addQuestionnaireRoute('contactarisque', contactarisque)
        this.addQuestionnaireRoute('depistage', depistage)
        this.addQuestionnaireRoute('situation', situation)
        this.addQuestionnaireRoute('sante', sante)

        this.addAppRoute('conseils', conseils, beforeConseils)
        this.addAppRoute(
            'suiviintroduction',
            suiviintroduction,
            beforeSuiviIntroduction
        )
        this.addAppRoute('suivisymptomes', suivisymptomes, beforeSuiviSymptomes)
        this.addAppRoute('suivihistorique', suivihistorique, beforeSuiviHistorique)

        this.addRoute('pediatrie', (element) => {
            if (app.profil.isComplete()) {
                showElement(element.querySelector('.js-profil-full'))
                hideElement(element.querySelector('.js-profil-empty'))
            }
        })

        this.addRoute('conditionsutilisation', (element) => {
            if (app.profil.isComplete()) {
                showElement(element.querySelector('.js-profil-full'))
                hideElement(element.querySelector('.js-profil-empty'))
            }
        })

        this.addRoute('nouvelleversiondisponible', (element) => {
            const route = this.navigo.lastRouteResolved()
            const urlParams = new URLSearchParams(route.query)
            const origine = urlParams.get('origine')

            nouvelleversion(element, app, origine)
        })

        // Legacy redirects.
        this.navigo.on(
            new RegExp('^(symptomesactuels|symptomespasses|debutsymptomes)$'),
            () => {},
            {
                before: (done) => {
                    this.redirectTo('symptomes')
                    done(false)
                },
            }
        )
        this.navigo.on(new RegExp('^(residence|foyer|activitepro)$'), () => {}, {
            before: (done) => {
                this.redirectTo('situation')
                done(false)
            },
        })
        this.navigo.on(new RegExp('^(caracteristiques|antecedents)$'), () => {}, {
            before: (done) => {
                this.redirectTo('sante')
                done(false)
            },
        })

        this.navigo.notFound(() => {
            this.redirectTo('introduction')
        })
    }

    initNavigo() {
        const root = null
        const useHash = true
        const navigo = new Navigo(root, useHash)

        // Workaround unwanted behaviour in Navigo.
        if (navigo.root.slice(-1) !== '/') {
            navigo.root = navigo.root + '/'
        }

        return navigo
    }

    setupGlobalHooks() {
        this.navigo.hooks({
            before: this.beforeGlobalHook.bind(this),
            after: this.afterGlobalHook.bind(this),
        })
    }

    beforeGlobalHook(done) {
        var header = document.querySelector('header section')
        if (typeof this.app.profil.nom === 'undefined') {
            showElement(header.querySelector('.js-profil-empty'))
            hideElement(header.querySelector('.js-profil-full'))
        } else {
            showElement(header.querySelector('.js-profil-full'))
            hideElement(header.querySelector('.js-profil-empty'))
            nomProfil(header.querySelector('#nom-profil-header'), this.app)
        }
        done()
    }

    afterGlobalHook() {
        this.sendPageChangeEvent()
    }

    sendPageChangeEvent() {
        const pageName = getCurrentPageName()
        document.dispatchEvent(new CustomEvent('pageChanged', { detail: pageName }))
    }

    focusMainHeaderElement() {
        // A11Y: keyboard navigation
        document.querySelector('[role="banner"]').focus()
    }

    addQuestionnaireRoute(pageName, view, pageTitle) {
        const beforeFunc = (profil) => {
            if (typeof profil.nom === 'undefined') {
                profil.resetData('mes_infos')
            }
            return this.app.questionnaire.before(pageName, profil)
        }
        this.addAppRoute(pageName, view, beforeFunc, pageTitle)
    }

    addAppRoute(pageName, view, before, pageTitle) {
        const viewFunc = (element) => {
            view(element, this.app)
        }
        this.addRoute(pageName, viewFunc, before, pageTitle)
    }

    addRoute(pageName, viewFunc, beforeFunc, pageTitle) {
        this.navigo.on(
            new RegExp('^' + pageName + '$'),
            () => {
                var element = loadPage(pageName, this.app)
                this.updateTitle(element, pageName, pageTitle, this.app.profil)
                this.fillProgress(element, pageName)
                this.fillNavigation(element, pageName)
                viewFunc(element)
                this.app.trackPageView(pageName)
                const page = element.parentElement
                page.classList.remove('loading')
                page.classList.add('ready')
            },
            {
                before: (done) => {
                    if (typeof beforeFunc === 'undefined') {
                        done()
                        return
                    }

                    const target = beforeFunc(this.app.profil, this.app.questionnaire)
                    if (target && target !== pageName) {
                        this.redirectTo(target)
                        done(false)
                    } else {
                        done()
                    }
                },
            }
        )
    }

    // A11Y: mise à jour du titre dynamiquement.
    updateTitle(element, pageName, pageTitle, profil) {
        let titlePrefix = pageTitle
        if (typeof pageTitle === 'undefined') {
            const titleElem = element.querySelector('h1, #conseils-block-titre, h2')
            if (titleElem) {
                titlePrefix = titleElem.innerText
            } else {
                titlePrefix = titleCase(pageName)
            }
        }
        const separator = titlePrefix ? ' — ' : ''
        const numeroEtape = this.app.questionnaire.numeroEtape(pageName, profil)
        const etape = numeroEtape ? ` (étape ${numeroEtape})` : ''
        document.title = titlePrefix + etape + separator + this.initialTitle
    }

    fillProgress(element, pageName) {
        const progress = element.querySelector('.progress')
        if (progress) {
            progress.innerText = this.app.questionnaire.etapesRestantes(pageName)
        }
    }

    fillNavigation(element, pageName) {
        const boutonRetour = element.querySelector(
            'form .back-button, .form-controls .back-button'
        )
        if (boutonRetour) {
            const previousPage = this.app.questionnaire.previousPage(
                pageName,
                this.app.profil
            )
            if (previousPage) {
                boutonRetour.setAttribute('href', `#${previousPage}`)
            }
        }

        Array.from(element.querySelectorAll('.premiere-question')).forEach((lien) => {
            lien.setAttribute('href', `#${this.app.questionnaire.firstPage}`)
        })
    }

    redirectTo(target) {
        if (
            typeof window !== 'undefined' &&
            window.history &&
            window.history.replaceState
        ) {
            // Replace current page with target page in the browser history
            // so that we don’t break the back button.
            window.history.replaceState({}, '', `#${target}`)
            this.navigo.resolve()
        } else {
            this.navigo.navigate(target)
        }
    }
}

export function initRouter(app) {
    return new Router(app).navigo
}
