export function errorResponse(errorMsg: string) {
    console.log(JSON.stringify({ status: "error", log: errorMsg }));
}

export function successResponse(payload: any) {
    console.log(JSON.stringify({ status: "success", result: payload }));
}
