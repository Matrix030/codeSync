class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        h = {}

        for i in range(len(nums)):
            if nums[i] not in h:
                h[nums[i]] = i
            diff = target - nums[i]
            if diff in h and h[diff] != i:
                return i, h[diff]

                #this is from browser part 2
                #this is somethign from nvim 
