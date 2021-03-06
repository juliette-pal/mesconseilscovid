// Données privées, stockées uniquement en local
import localforage from 'localforage'

export default class StockageLocal {
    constructor() {
        this.localforage = localforage
    }

    getProfilActuel() {
        return localforage.getItem('profil')
    }

    setProfilActuel(nom) {
        return localforage.setItem('profil', nom)
    }

    getProfil(nom) {
        return localforage.getItem(nom)
    }

    getProfils() {
        return localforage
            .keys()
            .then((noms) => {
                return noms.filter((nom) => nom != 'profil')
            })
            .then((noms) => {
                return noms.sort((a) => {
                    // Make sure we return my profile first.
                    return a !== 'mes_infos'
                })
            })
    }

    supprimerTout() {
        return localforage
            .dropInstance()
            .then(() => {
                console.debug('Les données personnelles ont été supprimées')
            })
            .catch((error) => {
                console.error(
                    `Erreur lors de la suppression de toutes les données personnelles`
                )
                console.error(error)
            })
    }

    supprimer(nom) {
        return localforage
            .removeItem(nom)
            .then(() => {
                console.debug(`Les données personnelles ont été supprimées (${nom})`)
                return
            })
            .catch((error) => {
                console.error(
                    `Erreur lors de la suppression des données personnelles (${nom})`
                )
                console.error(error)
            })
    }

    charger(profil) {
        return localforage
            .getItem(profil.nom)
            .then((data) => {
                if (data !== null) {
                    // console.debug(`Données locales (${profil.nom})`)
                    // console.log(data)
                    profil.fillData(data)
                } else {
                    console.debug(
                        `Pas de données locales pour l’instant (${profil.nom})`
                    )
                    profil.resetData()
                }
                return profil
            })
            .catch((error) => {
                console.error(
                    `Erreur de chargement des données locales (${profil.nom})`
                )
                console.error(error)
            })
    }

    enregistrer(profil) {
        return localforage
            .setItem(profil.nom, profil.getData())
            .then((data) => {
                console.debug(
                    `Les réponses au questionnaire ont bien été enregistrées (${profil.nom})`
                )
                console.debug(data)
            })
            .catch((error) => {
                console.error(
                    `Les réponses au questionnaire n’ont pas pu être enregistrées (${profil.nom})`
                )
                console.error(error)
            })
    }
}
