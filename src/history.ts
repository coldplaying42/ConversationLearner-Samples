import * as supertest from 'supertest'
import app from './app'
import * as models from '@conversationlearner/models'
import * as fs from 'fs'
import * as util from 'util'


const writeFile = util.promisify(fs.writeFile)
let botServer: supertest.SuperTest<supertest.Test> = supertest(app)

async function history(appId : string) {
    var response = await botServer.get(`/sdk/app/${appId}/source`).set('x-conversationlearner-memory-key', 'testUser')      
    var source = response.body as models.AppDefinition
    var histories = <any>[]
    let count = 0; 
    for(const trainDialog of source.trainDialogs) {
        var response = await botServer.post(`/sdk/app/${appId}/history`).set('x-conversationlearner-memory-key', 'testUser').send({...trainDialog, definitions: { entities : source.entities, actions: source.actions }})
        histories.push(((response.body) as models.TeachWithHistory).history)
        console.log(`History for ${Math.round(100*(++count/source.trainDialogs.length))}% of train dialogs have been retrieved!`)
    }

    
    let entityDict : Map<string, models.EntityBase> = new Map()
    source.entities.forEach(entity => {
        entityDict.set(entity.entityId, entity)
    })
    

    let idx = 0;
    let compactHistory : Array<string> = []
    source.trainDialogs = source.trainDialogs.map(trainDialog => {
        var activities : any[] = histories[idx++];
        let index = 0;
        compactHistory.push(trainDialog.trainDialogId)
        trainDialog.rounds = trainDialog.rounds.map(round => {
            round = <any>{userInput: activities[index++], ...round};
            compactHistory.push(`+${(round as any).userInput.text}`)
            
            round.scorerSteps = round.scorerSteps.map(step => {
                step.input.filledEntities = step.input.filledEntities.map(entity => {
                    let entityDefintion = entityDict.get(entity.entityId as string)
                        if(entityDefintion !== undefined)
                        {
                            return {
                                ...entity, 
                                entityType: entityDefintion.entityType, 
                                entityName : entityDefintion.entityName
                            }
                        }
                    return entity
                })
                let newStep = <any>{...step, output: activities[index++]}
                return newStep
            } )
            
            // add entity information to labeled entities
            round.extractorStep.textVariations = round.extractorStep.textVariations.map(textVariation => {
                textVariation.labelEntities = textVariation.labelEntities.map(label => { 
                    let entityDefintion = entityDict.get(label.entityId)
                    if(entityDefintion !== undefined)
                    {
                        return {
                            ...label, 
                            entityType: entityDefintion.entityType, 
                            entityName : entityDefintion.entityName
                        }

                    }
                    return label
                }
                )   
                return textVariation
            })
            compactHistory = compactHistory.concat(round.scorerSteps.map(step => `-${(step as any).output.text}`))
            return round; 
        })
        compactHistory.push("============================================")
        return trainDialog;
    })

    await writeFile('history.json', JSON.stringify(source))
    let s = ""
    compactHistory.map(value => s += `${value}\n`)
    await writeFile('history.compact.txt', s)
}

history('d14dc392-7b4d-4e7a-8911-2cf672e18ce3').then(() => console.log('history have been retrieved! Check history.json.'), (reason) => console.log(reason));