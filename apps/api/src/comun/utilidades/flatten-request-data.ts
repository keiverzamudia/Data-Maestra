// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenRequestData(raw: any) {
  const { requestData, ...rest } = raw;
  if (!requestData) return rest;
  return {
    ...rest,
    groupId: requestData.groupId,
    subgroupId: requestData.subgroupId,
    categoryId: requestData.categoryId,
    brandId: requestData.brandId,
    unitId: requestData.unitId,
    manufacturer: requestData.manufacturer,
    model: requestData.model,
    partNumber: requestData.partNumber,
    application: requestData.application,
    masterCode: requestData.masterCode,
    articleType: requestData.articleType,
    articleTypeManual: requestData.articleTypeManual,
    taxType: requestData.taxType,
    unitCode: requestData.unitCode,
  };
}
