module.exports = async function (ok, F) { console.log(Object.keys(F).join(',')); console.log(Object.keys(F.shapeKeys||{}), Object.keys(F.convert||{}), Object.keys(F.taskPlan||{}).length) }
